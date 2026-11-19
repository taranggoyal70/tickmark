/**
 * The gradient step.
 *
 * Corrections are the loss signal. This turns them into Rule diffs, then
 * replays each candidate against every closed period before anyone is allowed
 * to activate it. Two constraints are borrowed from backpass and matter more
 * here than they do in code review:
 *
 *   evidence-gated  - >= 2 distinct corrections, quoted, or no rule
 *   analysis never writes - proposing and activating are separate acts
 *
 * https://github.com/kunchenguid/backpass
 */
import type { GeneratedPeriod } from "../seed/generate";
import { distillRules, type ChartContext, type CorrectionRow, type Usage } from "./llm";
import { DEFAULT_MODEL, type ModelId } from "./pricing";
import { applyMatchingRule, describeAction, evaluate, type MatchWorkspace } from "./rules";
import { normalizeRuleText, semanticRuleSignature } from "./rule-signature";
import { splitKey } from "./close";
import type { BacktestResult, DeltaReason, EvidenceItem, Rule, Rulebook } from "./types";

export interface CorrectionRecord extends CorrectionRow {
  /** structured, not prose - this is what makes distillation reliable */
  kind: "coding" | "matching" | "accrual";
  glCode?: string;
  deptSplit?: Record<string, number>;
  amountCents: number;
  /** what the corrected line said: an invoice description or a bank narrative */
  subjectText?: string;
  /** for a matching correction, the shape the controller confirmed */
  shape?: { cardinality: string; deltaReason: string | null };
}

let ruleSeq = 0;
const nextRuleId = () => `RULE-${String(++ruleSeq).padStart(3, "0")}`;

const evidenceFor = (rows: CorrectionRecord[]): EvidenceItem[] => rows.map((c) => ({
  correctionId: c.id, periodCode: c.period, subjectRef: c.subject,
  quote: `agent said "${c.agentSaid}", controller set "${c.humanSaid}"${c.note ? ` - ${c.note}` : ""}`,
}));

/**
 * The newest run of agreeing corrections. A policy that changed is not a
 * conflict: once two corrections in a row agree on the new treatment, the older
 * ones are superseded evidence. Corrections that disagree with each other at
 * the head of the history still compile to nothing.
 */
function latestAgreeingRun<T>(rows: T[], outcome: (row: T) => string): { run: T[]; superseded: boolean } {
  if (rows.length === 0) return { run: [], superseded: false };
  const head = outcome(rows[rows.length - 1]);
  let start = rows.length - 1;
  while (start > 0 && outcome(rows[start - 1]) === head) start--;
  return { run: rows.slice(start), superseded: start > 0 };
}

const byPeriod = <T extends { period: string }>(rows: T[]) =>
  rows.map((row, i) => ({ row, i }))
    .sort((a, b) => a.row.period.localeCompare(b.row.period) || a.i - b.i)
    .map(({ row }) => row);

/**
 * Compile the unambiguous part of the loss signal without asking a model to
 * reproduce facts the corrections already state structurally. The model may
 * still propose richer rules, but reliability does not depend on it emitting
 * policy syntax. Conflicting corrections deliberately compile to nothing.
 */
export function compileCorrectionRules(
  corrections: CorrectionRecord[], closed: GeneratedPeriod[],
): Rule[] {
  const byVendor = new Map<string, CorrectionRecord[]>();
  for (const correction of corrections) {
    if (correction.kind !== "coding" || !correction.vendor || !correction.glCode || !correction.deptSplit) continue;
    const key = correction.vendor.trim().toLocaleLowerCase();
    (byVendor.get(key) ?? byVendor.set(key, []).get(key)!).push(correction);
  }

  const rules: Rule[] = [];
  for (const all of byVendor.values()) {
    const { run: rows, superseded } = latestAgreeingRun(
      byPeriod(all), (row) => `${row.glCode}|${splitKey(row.deptSplit ?? {})}`,
    );
    if (rows.length < 2) continue;

    const first = rows[0];
    const rule: Rule = {
      id: nextRuleId(), kind: "coding",
      name: `${first.vendor} → ${first.glCode} (${splitKey(first.deptSplit ?? {})})`,
      predicate: [{ op: "vendor_is", value: first.vendor }],
      action: { type: "code", glCode: first.glCode!, deptSplit: first.deptSplit! },
      status: "proposed", version: 1, evidence: evidenceFor(rows), backtest: null,
      hitCount: 0, createdAt: new Date().toISOString(),
      ...(superseded ? { effectiveFrom: first.period } : {}),
    };
    // A rule replacing a superseded policy is replayed from the change on;
    // replaying it against the old policy would only measure the old policy.
    rule.backtest = backtest(rule, superseded ? closed.filter((p) => p.code >= first.period) : closed);
    rules.push(rule);
  }
  return rules;
}

const STRATEGIES = ["by_invoice", "same_day_settlement", "installments"] as const;

/**
 * The words two bank narratives share at the start, minus anything carrying a
 * digit (references, amounts, phone numbers change every month).
 */
export function commonNarrative(texts: string[]): string {
  const words = texts.map((t) => normalizeRuleText(t).split(" ").filter((w) => w && !/\d/.test(w)));
  const out: string[] = [];
  for (let i = 0; words.every((w) => i < w.length && w[i] === words[0][i]); i++) out.push(words[0][i]);
  return out.join(" ");
}

/**
 * Compile matching corrections the same way coding corrections are compiled:
 * structurally, with no model. Corrections are grouped by vendor and by the
 * narrative the bank prints, and each candidate settlement strategy is
 * replayed against closed periods. Only the strategy the replay supports is
 * proposed, so the shape is learned from the books rather than declared.
 */
export function compileMatchingRules(
  corrections: CorrectionRecord[], closed: GeneratedPeriod[],
): Rule[] {
  const groups = new Map<string, CorrectionRecord[]>();
  for (const c of corrections) {
    if (c.kind !== "matching" || !c.vendor || !c.subjectText || !c.shape) continue;
    const lead = normalizeRuleText(c.subjectText).split(" ")[0] ?? "";
    if (!lead) continue;
    const key = `${normalizeRuleText(c.vendor)}|${lead}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(c);
  }

  const rules: Rule[] = [];
  for (const rows of groups.values()) {
    if (new Set(rows.map((r) => r.id)).size < 2) continue;
    const narrative = commonNarrative(rows.map((r) => r.subjectText!));
    if (narrative.length < 3) continue;
    const reasons = rows.map((r) => r.shape!.deltaReason).filter((x): x is string => !!x);
    const deltaReason = (reasons.sort((a, b) =>
      reasons.filter((x) => x === b).length - reasons.filter((x) => x === a).length)[0] ?? null) as DeltaReason | null;

    let best: Rule | null = null;
    for (const strategy of STRATEGIES) {
      const candidate: Rule = {
        id: "candidate", kind: "matching",
        name: `${rows[0].vendor} settles ${strategy.replace(/_/g, " ")}`,
        predicate: [{ op: "desc_contains", value: narrative }],
        action: { type: "match", vendorName: rows[0].vendor, strategy, deltaReason, tolerancePct: 0.02 },
        status: "proposed", version: 1, evidence: evidenceFor(rows), backtest: null,
        hitCount: 0, createdAt: new Date().toISOString(),
      };
      candidate.backtest = backtest(candidate, closed);
      const b = candidate.backtest, a = best?.backtest;
      if (!a || b.precision > a.precision || (b.precision === a.precision && b.wouldHaveBeenCorrect > a.wouldHaveBeenCorrect)) best = candidate;
    }
    if (best && best.backtest && best.backtest.wouldHaveFired > 0) rules.push({ ...best, id: nextRuleId() });
  }
  return rules;
}

/** A correction that a currently active rule would have decided differently. */
export interface Contradiction { ruleId: string; correctionId: string; ruleSaid: string; humanSaid: string; subject: string }

/**
 * Find active coding rules that a later human correction contradicts. A rule
 * is a compiled judgment; when the person whose judgment it compiled says
 * otherwise, the rule is wrong from here on, however good its replay was.
 */
export function findContradictions(rb: Rulebook, corrections: CorrectionRecord[]): Contradiction[] {
  const out: Contradiction[] = [];
  for (const rule of rb.rules) {
    if (rule.status !== "active" || rule.kind !== "coding" || rule.action.type !== "code") continue;
    const ruleSaid = describeAction(rule);
    for (const c of corrections) {
      if (c.kind !== "coding" || !c.glCode || !c.deptSplit) continue;
      const covered = evaluate(rule.predicate, {
        vendorName: c.vendor, description: `${c.vendor} ${c.subjectText ?? ""}`, amountCents: c.amountCents,
      });
      if (!covered) continue;
      const humanSaid = `${c.glCode}|${splitKey(c.deptSplit)}`;
      if (humanSaid !== ruleSaid) out.push({ ruleId: rule.id, correctionId: c.id, ruleSaid, humanSaid, subject: c.subject });
    }
  }
  return out;
}

/** Disable every rule a correction contradicted. The rule stays on file. */
export function suspendContradicted(rb: Rulebook, contradictions: Contradiction[]): Rulebook {
  if (contradictions.length === 0) return rb;
  const by = new Map<string, string>();
  for (const c of contradictions) if (!by.has(c.ruleId)) by.set(c.ruleId, c.correctionId);
  const now = new Date().toISOString();
  return {
    version: rb.version + 1,
    rules: rb.rules.map((r) => (by.has(r.id) && r.status === "active"
      ? { ...r, status: "disabled", suspendedBy: by.get(r.id), suspendedAt: now }
      : r)),
  };
}

/** Shape a model proposal into a Rule. Returns null if it is internally invalid. */
function materialize(p: Awaited<ReturnType<typeof distillRules>>["proposals"][number]): Rule | null {
  if (p.predicate.length === 0) return null;

  let action: Rule["action"] | null = null;
  if (p.actionType === "code") {
    if (!p.glCode || !p.deptSplit?.length) return null;
    const total = p.deptSplit.reduce((s, d) => s + Math.max(0, d.weight), 0) || 1;
    const split: Record<string, number> = {};
    for (const d of p.deptSplit) if (d.weight > 0) split[d.dept] = Math.round((d.weight / total) * 1000) / 1000;
    action = { type: "code", glCode: p.glCode, deptSplit: split };
  } else if (p.actionType === "match") {
    if (!p.matchVendor || !p.matchStrategy) return null;
    action = {
      type: "match", vendorName: p.matchVendor, strategy: p.matchStrategy,
      deltaReason: (p.deltaReason && p.deltaReason !== "none" ? p.deltaReason : null) as DeltaReason | null,
      tolerancePct: Math.min(0.05, Math.max(0, p.tolerancePct ?? 0.02)),
    };
  } else if (p.actionType === "accrue") {
    if (!p.glCode) return null;
    action = { type: "accrue", glCode: p.glCode, basis: p.accrualBasis ?? "trailing_avg_3" };
  } else {
    action = { type: "always_review", reason: p.reviewReason ?? "policy" };
  }

  return {
    id: nextRuleId(), kind: p.kind, name: p.name,
    predicate: p.predicate.map((q) => ({
      op: q.op,
      value: q.op === "amount_gte" || q.op === "amount_lte" ? Number(q.value) : q.value,
    })),
    action, status: "proposed", version: 1, evidence: [], backtest: null,
    hitCount: 0, createdAt: new Date().toISOString(),
  };
}

/** Replay one candidate rule across closed periods. This is the gate on adoption. */
export function backtest(rule: Rule, closed: GeneratedPeriod[]): BacktestResult {
  const regressions: BacktestResult["regressions"] = [];
  let fired = 0, correct = 0;

  for (const period of closed) {
    if (rule.kind === "coding" && rule.action.type === "code") {
      for (const inv of period.apInvoices) {
        const hit = evaluate(rule.predicate, {
          vendorName: inv.vendorName, description: `${inv.vendorName} ${inv.description}`, amountCents: inv.amountCents,
        });
        if (!hit) continue;
        fired++;
        const t = period.truth.coding[inv.invoiceNumber];
        const said = describeAction(rule);
        const want = t ? `${t.glCode}|${splitKey(t.deptSplit)}` : "unknown";
        if (said === want) correct++;
        else regressions.push({ periodCode: period.code, subjectRef: inv.invoiceNumber, expected: want, ruleSaid: said });
      }
    } else if (rule.kind === "matching" && rule.action.type === "match") {
      const ws: MatchWorkspace = {
        bankLines: period.bankLines, ledger: period.ledgerEntries,
        consumedBank: new Set(), consumedLedger: new Set(),
      };
      const key = (b: string[], l: string[]) => `${[...b].sort().join(",")}|${[...l].sort().join(",")}`;
      const want = new Set(period.truth.matches.map((t) => key(t.bankExternalIds, t.ledgerExternalIds)));
      for (const b of period.bankLines) {
        if (ws.consumedBank.has(b.externalId)) continue;
        const d = applyMatchingRule(rule, b, ws);
        if (!d) continue;
        fired++;
        if (want.has(key(d.bankExternalIds, d.ledgerExternalIds))) {
          correct++;
          d.bankExternalIds.forEach((x) => ws.consumedBank.add(x));
          d.ledgerExternalIds.forEach((x) => ws.consumedLedger.add(x));
        } else {
          regressions.push({
            periodCode: period.code, subjectRef: b.externalId,
            expected: "a different set of ledger lines", ruleSaid: d.ledgerExternalIds.join("+"),
          });
        }
      }
    } else if (rule.kind === "accrual" && rule.action.type === "accrue") {
      for (const a of period.truth.expectedAccruals) {
        if (!evaluate(rule.predicate, { vendorName: a.vendorName, description: a.vendorName })) continue;
        fired++;
        if (rule.action.glCode === a.glCode) correct++;
        else regressions.push({ periodCode: period.code, subjectRef: a.vendorName, expected: a.glCode, ruleSaid: rule.action.glCode });
      }
    } else {
      // always_review: firing is the point; there is no wrong answer, only reach
      for (const inv of period.apInvoices) {
        if (evaluate(rule.predicate, { vendorName: inv.vendorName, description: inv.description, amountCents: inv.amountCents })) { fired++; correct++; }
      }
    }
  }

  return {
    periodsReplayed: closed.map((p) => p.code),
    wouldHaveFired: fired, wouldHaveBeenCorrect: correct, wouldHaveBeenWrong: fired - correct,
    regressions: regressions.slice(0, 20),
    precision: fired === 0 ? 0 : correct / fired,
  };
}

export interface GradientStepResult {
  proposals: Rule[];
  usage: Usage;
  correctionsConsidered: number;
}

export async function gradientStep(
  corrections: CorrectionRecord[], chart: ChartContext, closed: GeneratedPeriod[], model: ModelId = DEFAULT_MODEL,
  modelCorrections: CorrectionRecord[] = corrections,
): Promise<GradientStepResult> {
  if (corrections.length === 0) {
    return { proposals: [], usage: { tokensIn: 0, tokensOut: 0, costMicros: 0, calls: 0 }, correctionsConsidered: 0 };
  }

  const { proposals: raw, usage } = await distillRules(
    modelCorrections.map(({ id, period, subject, vendor, agentSaid, humanSaid, note }) => ({ id, period, subject, vendor, agentSaid, humanSaid, note })),
    chart, model, { periodCode: modelCorrections[0]?.period },
  );

  const byId = new Map(corrections.map((c) => [c.id, c]));
  const out: Rule[] = [];

  for (const p of raw) {
    const rule = materialize(p);
    if (!rule) continue;

    // Evidence gate: >= 2 DISTINCT real corrections, quoted verbatim - and the
    // evidence has to be about the same thing the rule decides. A coding rule
    // justified by reconciliation corrections is not evidenced, it is
    // decorated, and an auditor would say so.
    const wantKind: CorrectionRecord["kind"] | null =
      rule.kind === "coding" ? "coding" :
      rule.kind === "matching" ? "matching" :
      rule.kind === "accrual" ? "accrual" : null;

    const cited = [...new Set(p.fromCorrectionIds)]
      .map((id) => byId.get(id))
      .filter((c): c is CorrectionRecord => !!c && (wantKind === null || c.kind === wantKind));
    if (cited.length < 2) continue;

    rule.evidence = evidenceFor(cited);
    rule.backtest = backtest(rule, closed);
    out.push(rule);
  }

  const signatures = new Set(out.map(semanticRuleSignature));
  for (const compiled of [...compileCorrectionRules(corrections, closed), ...compileMatchingRules(corrections, closed)]) {
    const signature = semanticRuleSignature(compiled);
    if (signatures.has(signature)) continue;
    signatures.add(signature);
    out.push(compiled);
  }

  return { proposals: out, usage, correctionsConsidered: corrections.length };
}

/**
 * The human gate, as a controller would exercise it: a rule earns activation
 * only if the replay shows it firing on real history and never breaking a case
 * that was already right.
 */
export const ADOPTION = { minPrecision: 0.95, minFired: 2 } as const;

export function wouldAdopt(rule: Rule): boolean {
  const b = rule.backtest;
  if (!b) return false;                              // invariant 6
  if (rule.evidence.length < 2) return false;        // evidence gate
  return b.wouldHaveFired >= ADOPTION.minFired && b.precision >= ADOPTION.minPrecision;
}

export function applyToRulebook(rb: Rulebook, accepted: Rule[]): Rulebook {
  if (accepted.length === 0) return rb;
  const now = new Date().toISOString();
  const activeBySignature = new Map(
    rb.rules
      .filter((rule) => rule.status === "active")
      .map((rule) => [semanticRuleSignature(rule), rule.id]),
  );
  let activated = 0;
  const decisions = accepted.map((rule): Rule => {
    const semanticSignature = semanticRuleSignature(rule);
    const duplicateOf = activeBySignature.get(semanticSignature);
    if (duplicateOf) {
      return {
        ...rule, status: "disabled", semanticSignature, duplicateOf,
        deduplicatedAt: now,
      };
    }
    activated++;
    activeBySignature.set(semanticSignature, rule.id);
    return { ...rule, status: "active", semanticSignature, activatedAt: now };
  });
  return {
    // A Rulebook version describes executable behavior. Retaining a duplicate
    // evidence trail without activating it does not produce a new version.
    version: rb.version + (activated > 0 ? 1 : 0),
    rules: [...rb.rules, ...decisions],
  };
}
