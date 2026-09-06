/**
 * The model-backed half of the agent.
 *
 * Only the residue reaches here - anything the Rulebook already knows was
 * settled deterministically upstream for zero tokens. Every call is batched,
 * every context block is TOON, and the stable prefix (policy, chart of
 * accounts, departments) is sent first so it can be cached.
 */
import { generateObject } from "ai";
import { z } from "zod";
import { DEFAULT_MODEL, costMicros, type ModelId } from "./pricing";
import { resolveModel } from "./provider";
import { telemetryFor, type TraceContext } from "./tracing";
import { clip, toonTable, usd } from "./toon";
import type { ApInvoice, BankLine, DeltaReason, LedgerEntry } from "./types";

export interface Usage { tokensIn: number; tokensOut: number; costMicros: number; calls: number }
export const zeroUsage = (): Usage => ({ tokensIn: 0, tokensOut: 0, costMicros: 0, calls: 0 });
export const addUsage = (a: Usage, b: Usage): Usage => ({
  tokensIn: a.tokensIn + b.tokensIn, tokensOut: a.tokensOut + b.tokensOut,
  costMicros: a.costMicros + b.costMicros, calls: a.calls + b.calls,
});

const account = (u: { inputTokens?: number; outputTokens?: number }, model: ModelId): Usage => {
  const ti = u.inputTokens ?? 0, to = u.outputTokens ?? 0;
  return { tokensIn: ti, tokensOut: to, costMicros: costMicros(model, ti, to), calls: 1 };
};

// ── shared context (stable prefix - cacheable) ───────────────────────────────

export interface ChartContext {
  accounts: { code: string; name: string; type: string }[];
  departments: { code: string; name: string }[];
  materialityCents: number;
  ruleCeilingCents: number;
}

const chartBlock = (c: ChartContext) => [
  toonTable("accounts", c.accounts, ["code", "name", "type"]),
  toonTable("departments", c.departments, ["code", "name"]),
  `materiality_usd: ${usd(c.materialityCents)}`,
].join("\n\n");

const POLICY = `You are the close agent for a company's month-end close. You code AP
invoices and reconcile a bank statement.

Non-negotiable:
- Never invent a GL account or department code. Use only the codes given.
- Department weights for one invoice must sum to 1.0.
- confidence is your honest probability of being exactly right, 0..1. A
  well-calibrated 0.6 is worth far more to the controller than an inflated 0.95;
  anything you are unsure of should be handed to a human, and that is a success,
  not a failure.
- Prefer the pattern the vendor's own history shows over what the account name
  sounds like.`;

// ── invoice coding ───────────────────────────────────────────────────────────

const CodingOut = z.object({
  decisions: z.array(z.object({
    invoiceNumber: z.string(),
    glCode: z.string(),
    deptSplit: z.array(z.object({ dept: z.string(), weight: z.number() })),
    confidence: z.number(),
    reasoning: z.string(),
  })),
});

export interface VendorHistoryRow {
  vendor: string; glCode: string; deptSplit: string; timesSeen: number; lastPeriod: string;
}

export async function codeInvoices(
  invoices: ApInvoice[], chart: ChartContext, history: VendorHistoryRow[], model: ModelId = DEFAULT_MODEL,
  trace: Omit<TraceContext, "pass"> = {},
) {
  const { object, usage } = await generateObject({
    model: resolveModel(model),
    experimental_telemetry: await telemetryFor({ ...trace, pass: "coding", batchSize: invoices.length }),
    schema: CodingOut,
    system: `${POLICY}\n\n${chartBlock(chart)}`,
    // AXI 4: the history aggregate is precomputed so the model never has to ask for it
    prompt: [
      history.length
        ? `How these vendors were coded in closed periods (already reviewed by a human):\n${toonTable("vendor_history", history, ["vendor", "glCode", "deptSplit", "timesSeen", "lastPeriod"])}`
        : "vendor_history[0]: none - this is the first close, so you have no precedent to lean on.",
      "",
      toonTable(
        "uncoded_invoices",
        invoices.map((i) => ({
          num: i.invoiceNumber, vendor: i.vendorName, amount: usd(i.amountCents),
          cur: i.currency, desc: clip(i.description, 70), date: i.invoiceDate,
        })),
        ["num", "vendor", "amount", "cur", "desc", "date"],
      ),
      "",
      "Return one decision per invoice.",
    ].join("\n"),
  });
  return { decisions: object.decisions, usage: account(usage, model) };
}

// ── bank reconciliation ──────────────────────────────────────────────────────

const MatchOut = z.object({
  matches: z.array(z.object({
    bankExternalIds: z.array(z.string()),
    ledgerExternalIds: z.array(z.string()),
    deltaReason: z.enum(["fx", "bank_fee", "partial", "timing", "none"]),
    confidence: z.number(),
    reasoning: z.string(),
  })),
  unmatchable: z.array(z.object({ bankExternalId: z.string(), why: z.string() })),
});

export async function matchBankLines(
  bank: BankLine[], candidates: LedgerEntry[], model: ModelId = DEFAULT_MODEL,
  trace: Omit<TraceContext, "pass"> = {},
) {
  const { object, usage } = await generateObject({
    model: resolveModel(model),
    experimental_telemetry: await telemetryFor({ ...trace, pass: "matching", batchSize: bank.length }),
    schema: MatchOut,
    system: `${POLICY}

Reconciliation rules:
- Sign convention is debit-positive. A bank line and the ledger entries that
  explain it must sum to approximately zero.
- One bank line legitimately explains several ledger entries (a batch payment, a
  department split), and several bank lines can explain one (installments).
- A residual difference is not automatically an error. Name it: fx, bank_fee,
  partial, or timing. If you cannot name it, do not force the match.
- A line that is genuinely on the bank but not yet in the ledger is a timing
  difference. Report it as unmatchable rather than attaching it to something.`,
    prompt: [
      toonTable(
        "bank_lines",
        bank.map((b) => ({ id: b.externalId, date: b.postedDate, desc: clip(b.description, 60), amount: usd(b.amountCents) })),
        ["id", "date", "desc", "amount"],
      ),
      "",
      toonTable(
        "ledger_candidates",
        candidates.map((e) => ({
          id: e.externalId, date: e.entryDate, gl: e.glCode ?? "", dept: e.deptCode ?? "",
          vendor: e.vendorName ?? "", amount: usd(e.amountCents), memo: clip(e.memo, 44),
        })),
        ["id", "date", "gl", "dept", "vendor", "amount", "memo"],
      ),
      "",
      "Every ledger entry may be used at most once across all matches.",
    ].join("\n"),
  });

  const matches = object.matches.map((m) => ({
    ...m,
    deltaReason: (m.deltaReason === "none" ? null : m.deltaReason) as DeltaReason | null,
  }));
  return { matches, unmatchable: object.unmatchable, usage: account(usage, model) };
}

// ── the gradient step ────────────────────────────────────────────────────────

const RuleOut = z.object({
  rules: z.array(z.object({
    kind: z.enum(["coding", "matching", "accrual", "materiality"]),
    name: z.string(),
    predicate: z.array(z.object({
      op: z.enum(["vendor_is", "desc_contains", "desc_matches", "amount_gte", "amount_lte", "source_is", "cadence_is"]),
      value: z.string(),
    })),
    actionType: z.enum(["code", "match", "accrue", "always_review"]),
    glCode: z.string().nullable(),
    deptSplit: z.array(z.object({ dept: z.string(), weight: z.number() })).nullable(),
    matchVendor: z.string().nullable(),
    matchStrategy: z.enum(["by_invoice", "same_day_settlement", "installments"]).nullable(),
    deltaReason: z.enum(["fx", "bank_fee", "partial", "timing", "none"]).nullable(),
    tolerancePct: z.number().nullable(),
    accrualBasis: z.enum(["trailing_avg_3", "last_period"]).nullable(),
    reviewReason: z.string().nullable(),
    rationale: z.string(),
    /** Ids of the corrections this rule was distilled from. Must be >= 2 distinct. */
    fromCorrectionIds: z.array(z.string()),
  })),
});

export interface CorrectionRow {
  id: string; period: string; subject: string; vendor: string;
  agentSaid: string; humanSaid: string; note: string;
}

export async function distillRules(
  corrections: CorrectionRow[], chart: ChartContext, model: ModelId = DEFAULT_MODEL,
  trace: Omit<TraceContext, "pass"> = {},
) {
  const { object, usage } = await generateObject({
    model: resolveModel(model),
    experimental_telemetry: await telemetryFor({ ...trace, pass: "gradient", batchSize: corrections.length }),
    schema: RuleOut,
    system: `${POLICY}

You are now doing something different: turning what a human corrected into a
durable, deterministic rule, so the same judgment never has to be made twice.

Hard constraints, because these rules will post real accounting entries:
- Propose a rule ONLY where at least two DISTINCT corrections show the same
  pattern. One correction is an anecdote, not a rule. List their ids in
  fromCorrectionIds.
- Prefer the narrowest predicate that covers the evidence. A rule that fires on
  everything is worse than no rule.
- If corrections for the same vendor disagree, propose nothing for that vendor
  and say so in the rationale. Silence is a valid, and often correct, output.
- Where the pattern is "a human should always look at this", the right rule is
  always_review, not a coding rule with high confidence.

${chartBlock(chart)}`,
    prompt: [
      toonTable("corrections", corrections, ["id", "period", "subject", "vendor", "agentSaid", "humanSaid", "note"]),
      "",
      "Propose the rules this evidence actually supports. Proposing none is fine.",
    ].join("\n"),
  });
  return { proposals: object.rules, usage: account(usage, model) };
}
