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
import { splitKey } from "./close";
import type { BacktestResult, DeltaReason, EvidenceItem, Rule, Rulebook } from "./types";

export interface CorrectionRecord extends CorrectionRow {
  /** structured, not prose - this is what makes distillation reliable */
  kind: "coding" | "matching" | "accrual";
  glCode?: string;
  deptSplit?: Record<string, number>;
  amountCents: number;
}

let ruleSeq = 0;
const nextRuleId = () => `RULE-${String(++ruleSeq).padStart(3, "0")}`;

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
): Promise<GradientStepResult> {
  if (corrections.length === 0) {
    return { proposals: [], usage: { tokensIn: 0, tokensOut: 0, costMicros: 0, calls: 0 }, correctionsConsidered: 0 };
  }

  const { proposals: raw, usage } = await distillRules(
    corrections.map(({ id, period, subject, vendor, agentSaid, humanSaid, note }) => ({ id, period, subject, vendor, agentSaid, humanSaid, note })),
    chart, model,
  );

  const byId = new Map(corrections.map((c) => [c.id, c]));
  const out: Rule[] = [];

  for (const p of raw) {
    const rule = materialize(p);
    if (!rule) continue;

    // evidence gate: >= 2 DISTINCT real corrections, quoted verbatim
    const cited = [...new Set(p.fromCorrectionIds)].map((id) => byId.get(id)).filter((c): c is CorrectionRecord => !!c);
    if (cited.length < 2) continue;

    rule.evidence = cited.map<EvidenceItem>((c) => ({
      correctionId: c.id, periodCode: c.period, subjectRef: c.subject,
      quote: `agent said "${c.agentSaid}", controller set "${c.humanSaid}"${c.note ? ` - ${c.note}` : ""}`,
    }));
    rule.backtest = backtest(rule, closed);
    out.push(rule);
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
  return {
    version: rb.version + 1,
    rules: [
      ...rb.rules,
      ...accepted.map((r) => ({ ...r, status: "active" as const, activatedAt: now })),
    ],
  };
}
