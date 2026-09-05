/**
 * One Close Run: the forward pass.
 *
 * Order matters and is the whole design. Every decision is offered to the
 * Rulebook first, deterministically and for free. Only what the Rulebook cannot
 * settle is worth spending a token on. As the Rulebook grows, the residue
 * shrinks - so the same close costs less each month without the model getting
 * any weaker.
 */
import type { GeneratedPeriod } from "../seed/generate";
import { codeInvoices, matchBankLines, zeroUsage, addUsage, type ChartContext, type Usage, type VendorHistoryRow } from "./llm";
import { DEFAULT_MODEL, type ModelId } from "./pricing";
import { applyAccrualRules, applyCodingRules, applyMatchingRules, consume, forcesReview, type MatchWorkspace } from "./rules";
import type {
  AccrualProposal, CloseRunResult, CodingDecision, Exception, LedgerEntry,
  MatchDecision, RunStats, Rulebook,
} from "./types";

export interface CloseInput {
  period: GeneratedPeriod;
  rulebook: Rulebook;
  chart: ChartContext;
  history: VendorHistoryRow[];
  /** Prior-period amounts per recurring vendor, for accrual sizing. */
  recurringHistory: Record<string, number[]>;
  autoThreshold: number;
  model?: ModelId;
  /** Batch sizes. Bigger batches cost fewer calls but blunt attention. */
  codingBatch?: number;
  matchBatch?: number;
}

const chunk = <T,>(xs: T[], n: number) =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

const toSplit = (rows: { dept: string; weight: number }[]): Record<string, number> => {
  const total = rows.reduce((s, r) => s + Math.max(0, r.weight), 0) || 1;
  const out: Record<string, number> = {};
  for (const r of rows) if (r.weight > 0) out[r.dept] = Math.round((r.weight / total) * 1000) / 1000;
  return out;
};

const daysBetween = (a: string, b: string) => Math.abs((Date.parse(a) - Date.parse(b)) / 86_400_000);

export async function runClose(input: CloseInput): Promise<CloseRunResult> {
  const t0 = Date.now();
  const model = input.model ?? DEFAULT_MODEL;
  const { period, rulebook, chart, autoThreshold } = input;

  let usage: Usage = zeroUsage();
  let ruleHits = 0;

  const codings: CodingDecision[] = [];
  const matches: MatchDecision[] = [];
  const accruals: AccrualProposal[] = [];
  const exceptions: Exception[] = [];
  let exSeq = 0;
  const openException = (e: Omit<Exception, "id">) => exceptions.push({ id: `EX-${period.code}-${++exSeq}`, ...e });

  // ── 1. coding: rulebook first ──────────────────────────────────────────────
  const residualInvoices = [];
  for (const inv of period.apInvoices) {
    const byRule = applyCodingRules(rulebook, inv);
    if (byRule) { codings.push(byRule); ruleHits++; }
    else residualInvoices.push(inv);
  }

  for (const batch of chunk(residualInvoices, input.codingBatch ?? 20)) {
    const { decisions, usage: u } = await codeInvoices(batch, chart, input.history, model);
    usage = addUsage(usage, u);
    const seen = new Set<string>();
    for (const d of decisions) {
      if (seen.has(d.invoiceNumber)) continue;
      seen.add(d.invoiceNumber);
      codings.push({
        invoiceNumber: d.invoiceNumber, glCode: d.glCode, deptSplit: toSplit(d.deptSplit),
        confidence: Math.max(0, Math.min(1, d.confidence)), decidedBy: "agent", reasoning: d.reasoning,
      });
    }
    // a model that silently drops an invoice must not silently lose it
    for (const inv of batch) {
      if (seen.has(inv.invoiceNumber)) continue;
      openException({
        subjectType: "ap_invoice", subjectRef: inv.invoiceNumber, cause: "no_candidate",
        amountCents: inv.amountCents, confidence: null,
        proposal: {}, options: [{ label: "Code manually", value: null }],
      });
    }
  }

  // ── 2. matching: rulebook first ────────────────────────────────────────────
  const ws: MatchWorkspace = {
    bankLines: period.bankLines, ledger: period.ledgerEntries,
    consumedBank: new Set(), consumedLedger: new Set(),
  };

  for (const b of period.bankLines) {
    if (ws.consumedBank.has(b.externalId)) continue;
    const byRule = applyMatchingRules(rulebook, b, ws);
    if (byRule) { matches.push(byRule); consume(ws, byRule); ruleHits++; }
  }

  const residualBank = period.bankLines.filter((b) => !ws.consumedBank.has(b.externalId));
  for (const batch of chunk(residualBank, input.matchBatch ?? 12)) {
    const candidates: LedgerEntry[] = period.ledgerEntries.filter(
      (e) => !ws.consumedLedger.has(e.externalId) && batch.some((b) => daysBetween(e.entryDate, b.postedDate) <= 12),
    );
    if (candidates.length === 0) {
      for (const b of batch) {
        openException({
          subjectType: "bank_line", subjectRef: b.externalId, cause: "no_candidate",
          amountCents: b.amountCents, confidence: null,
          proposal: { description: b.description },
          options: [{ label: "Timing difference - carry forward", value: "timing" }],
        });
      }
      continue;
    }

    const { matches: found, unmatchable, usage: u } = await matchBankLines(batch, candidates, model);
    usage = addUsage(usage, u);

    for (const m of found) {
      const bankIds = m.bankExternalIds.filter((id) => !ws.consumedBank.has(id));
      const ledIds = m.ledgerExternalIds.filter((id) => !ws.consumedLedger.has(id));
      if (bankIds.length === 0 || ledIds.length === 0) continue;
      const bankTotal = bankIds.reduce((s, id) => s + (period.bankLines.find((b) => b.externalId === id)?.amountCents ?? 0), 0);
      const ledTotal = ledIds.reduce((s, id) => s + (period.ledgerEntries.find((e) => e.externalId === id)?.amountCents ?? 0), 0);
      const d: MatchDecision = {
        bankExternalIds: bankIds, ledgerExternalIds: ledIds,
        cardinality: bankIds.length === 1 && ledIds.length === 1 ? "1:1" : bankIds.length === 1 ? "1:many" : ledIds.length === 1 ? "many:1" : "many:many",
        amountDeltaCents: ledTotal + bankTotal,
        deltaReason: m.deltaReason,
        confidence: Math.max(0, Math.min(1, m.confidence)),
        decidedBy: "agent", reasoning: m.reasoning,
      };
      matches.push(d);
      consume(ws, d);
    }

    for (const u2 of unmatchable) {
      const b = period.bankLines.find((x) => x.externalId === u2.bankExternalId);
      if (!b || ws.consumedBank.has(b.externalId)) continue;
      openException({
        subjectType: "bank_line", subjectRef: b.externalId, cause: "no_candidate",
        amountCents: b.amountCents, confidence: null,
        proposal: { description: b.description, why: u2.why },
        options: [{ label: "Timing difference - carry forward", value: "timing" }, { label: "Match manually", value: null }],
      });
    }
  }

  // anything the model neither matched nor explained is still ours to surface
  for (const b of period.bankLines) {
    if (ws.consumedBank.has(b.externalId)) continue;
    if (exceptions.some((e) => e.subjectRef === b.externalId)) continue;
    openException({
      subjectType: "bank_line", subjectRef: b.externalId, cause: "no_candidate",
      amountCents: b.amountCents, confidence: null,
      proposal: { description: b.description },
      options: [{ label: "Timing difference - carry forward", value: "timing" }],
    });
  }

  // ── 3. accrual completeness ────────────────────────────────────────────────
  const billed = new Set(period.apInvoices.map((i) => i.vendorName));
  for (const [vendor, hist] of Object.entries(input.recurringHistory)) {
    const a = applyAccrualRules(rulebook, vendor, hist, billed.has(vendor));
    if (a) { accruals.push(a); ruleHits++; }
    else if (!billed.has(vendor) && hist.length >= 2) {
      const avg = Math.round(hist.slice(-3).reduce((x, y) => x + y, 0) / Math.min(3, hist.length));
      openException({
        subjectType: "accrual", subjectRef: vendor, cause: "policy_requires_human",
        amountCents: avg, confidence: null,
        proposal: { vendorName: vendor, suggestedCents: avg, basis: "trailing_avg_3" },
        options: [
          { label: `Accrue ${(avg / 100).toFixed(2)}`, value: { accrue: avg } },
          { label: "No accrual - service stopped", value: { accrue: 0 } },
        ],
      });
    }
  }

  // ── 4. the gate: confidence AND materiality, neither overriding the other ──
  let tickmarked = 0;
  const gate = (ref: string, subjectType: Exception["subjectType"], conf: number, amountCents: number, proposal: unknown, options: Exception["options"]) => {
    const policy = forcesReview(rulebook, { description: ref, amountCents: Math.abs(amountCents) });
    if (policy) { openException({ subjectType, subjectRef: ref, cause: "policy_requires_human", amountCents, confidence: conf, proposal, options }); return false; }
    if (Math.abs(amountCents) > chart.materialityCents) { openException({ subjectType, subjectRef: ref, cause: "over_materiality", amountCents, confidence: conf, proposal, options }); return false; }
    if (conf < autoThreshold) { openException({ subjectType, subjectRef: ref, cause: "low_confidence", amountCents, confidence: conf, proposal, options }); return false; }
    tickmarked++; return true;
  };

  const autoCleared: { kind: "coding" | "match"; ref: string }[] = [];
  for (const c of codings) {
    const inv = period.apInvoices.find((i) => i.invoiceNumber === c.invoiceNumber);
    const ok = gate(c.invoiceNumber, "ap_invoice", c.confidence, inv?.amountCents ?? 0, c,
      [{ label: `Accept ${c.glCode}`, value: c }, { label: "Recode", value: null }]);
    if (ok) autoCleared.push({ kind: "coding", ref: c.invoiceNumber });
  }
  for (const m of matches) {
    const total = m.bankExternalIds.reduce((s, id) => s + (period.bankLines.find((b) => b.externalId === id)?.amountCents ?? 0), 0);
    const ok = gate(m.bankExternalIds.join("+"), "bank_line", m.confidence, total, m,
      [{ label: "Accept match", value: m }, { label: "Reject", value: null }]);
    if (ok) autoCleared.push({ kind: "match", ref: m.bankExternalIds.join("+") });
  }

  const stats = score(period, codings, matches, {
    llmCalls: usage.calls, ruleHits, tokensIn: usage.tokensIn, tokensOut: usage.tokensOut,
    costMicros: usage.costMicros, durationMs: Date.now() - t0,
    exceptionsOpened: exceptions.length, tickmarked, autoCleared,
  });

  return { periodCode: period.code, rulebookVersion: rulebook.version, codings, matches, accruals, exceptions, tickmarked, stats };
}

// ── measurement against ground truth ─────────────────────────────────────────

export const splitKey = (s: Record<string, number>) =>
  Object.entries(s).filter(([, w]) => w > 0.02).sort(([a], [b]) => a.localeCompare(b))
    .map(([d, w]) => `${d}:${Math.round(w * 100)}`).join("/");

/** Department splits are compared with a 3-point tolerance per department. */
const splitMatches = (a: Record<string, number>, b: Record<string, number>) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (Math.abs((a[k] ?? 0) - (b[k] ?? 0)) > 0.03) return false;
  return true;
};

export function codingIsCorrect(period: GeneratedPeriod, c: CodingDecision): boolean {
  const t = period.truth.coding[c.invoiceNumber];
  return !!t && t.glCode === c.glCode && splitMatches(t.deptSplit, c.deptSplit);
}

export function matchIsCorrect(period: GeneratedPeriod, m: MatchDecision): boolean {
  const key = (b: string[], l: string[]) => `${[...b].sort().join(",")}|${[...l].sort().join(",")}`;
  const want = new Set(period.truth.matches.map((t) => key(t.bankExternalIds, t.ledgerExternalIds)));
  return want.has(key(m.bankExternalIds, m.ledgerExternalIds));
}

function score(
  period: GeneratedPeriod, codings: CodingDecision[], matches: MatchDecision[],
  base: Omit<RunStats, "codingAccuracy" | "matchAccuracy" | "autoClearRate" | "autoClearPrecision"> &
        { tickmarked: number; autoCleared: { kind: "coding" | "match"; ref: string }[] },
): RunStats {
  const codingRight = codings.filter((c) => codingIsCorrect(period, c)).length;
  const matchRight = matches.filter((m) => matchIsCorrect(period, m)).length;

  const decisions = codings.length + matches.length;
  const clearedRefs = new Set(base.autoCleared.map((a) => `${a.kind}:${a.ref}`));
  const clearedCorrect =
    codings.filter((c) => clearedRefs.has(`coding:${c.invoiceNumber}`) && codingIsCorrect(period, c)).length +
    matches.filter((m) => clearedRefs.has(`match:${m.bankExternalIds.join("+")}`) && matchIsCorrect(period, m)).length;

  return {
    llmCalls: base.llmCalls, ruleHits: base.ruleHits,
    tokensIn: base.tokensIn, tokensOut: base.tokensOut,
    costMicros: base.costMicros, durationMs: base.durationMs,
    codingAccuracy: codings.length ? codingRight / codings.length : 0,
    matchAccuracy: period.truth.matches.length ? matchRight / period.truth.matches.length : 0,
    autoClearRate: decisions ? base.tickmarked / decisions : 0,
    autoClearPrecision: clearedRefs.size ? clearedCorrect / clearedRefs.size : 1,
    exceptionsOpened: base.exceptionsOpened,
  };
}
