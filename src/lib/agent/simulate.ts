/**
 * The eval harness: run the same close, month after month, and watch what the
 * learning loop does to the numbers. Nothing here is staged - every figure in
 * the report is measured from a real run against ground truth the agent cannot
 * see.
 */
import { generateAll, type GeneratedPeriod } from "../seed/generate";
import { DEPARTMENTS, ENTITY, GL_ACCOUNTS, VENDORS, type VendorSpec } from "../seed/fixture";
import { codingIsCorrect, matchIsCorrect, runClose } from "./close";
import { controllerReview, touchSeconds } from "./controller";
import {
  applyToRulebook, findContradictions, gradientStep, suspendContradicted, wouldAdopt,
  type Contradiction, type CorrectionRecord,
} from "./gradient";
import { zeroUsage, type ChartContext, type VendorHistoryRow } from "./llm";
import { DEFAULT_MODEL, type ModelId } from "./pricing";
import { effectiveModelId } from "./provider";
import { emptyRulebook } from "./rules";
import { splitKey } from "./close";
import type { ClosePeriodData, Exception, Rule, Rulebook, RunStats } from "./types";

export const CHART: ChartContext = {
  accounts: GL_ACCOUNTS.map((a) => ({ code: a.code, name: a.name, type: a.type })),
  departments: DEPARTMENTS.map((d) => ({ code: d.code, name: d.name })),
  materialityCents: ENTITY.materialityCents,
  ruleCeilingCents: ENTITY.ruleCeilingCents,
};

/** What a human has already signed off in closed periods. */
function vendorHistory(closed: GeneratedPeriod[]): VendorHistoryRow[] {
  const agg = new Map<string, VendorHistoryRow>();
  for (const p of closed) {
    for (const inv of p.apInvoices) {
      const t = p.truth.coding[inv.invoiceNumber];
      if (!t) continue;
      const k = `${inv.vendorName}|${t.glCode}|${splitKey(t.deptSplit)}`;
      const row = agg.get(k);
      if (row) { row.timesSeen++; row.lastPeriod = p.code; }
      else agg.set(k, { vendor: inv.vendorName, glCode: t.glCode, deptSplit: splitKey(t.deptSplit), timesSeen: 1, lastPeriod: p.code });
    }
  }
  return [...agg.values()].sort((a, b) => b.timesSeen - a.timesSeen);
}

function recurringHistory(closed: GeneratedPeriod[], vendors: VendorSpec[]): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  const recurring = new Set(vendors.filter((v) => v.recurring && v.cadence === "monthly" && !v.quirk).map((v) => v.name));
  for (const p of closed) {
    for (const inv of p.apInvoices) {
      if (!recurring.has(inv.vendorName)) continue;
      (out[inv.vendorName] ??= []).push(inv.amountCents);
    }
  }
  return out;
}

/** One decision, small enough that a whole close fits in the report and can be replayed. */
export interface DecisionFrame {
  ref: string;
  kind: "coding" | "matching" | "accrual";
  /** who settled it - a compiled rule costs nothing, the model costs tokens */
  by: "rule" | "agent";
  outcome: "tickmark" | "exception";
  amountCents: number;
  label: string;
  confidence: number;
}

export interface PeriodReport {
  period: string;
  rulebookVersionIn: number;
  rulebookVersionOut: number;
  activeRules: number;
  /** decisions the model actually made this period (rule hits excluded) */
  modelDecisions: number;
  /** the queue a controller actually worked this period */
  exceptions: Exception[];
  /** every decision, in order, so a close can be replayed rather than described */
  decisions: DecisionFrame[];
  stats: RunStats;
  corrections: number;
  touchSeconds: number;
  proposals: { name: string; kind: string; adopted: boolean; duplicate?: boolean; precision: number; fired: number; evidence: number }[];
  gradientCostMicros: number;
  /** model calls and tokens spent by the gradient step, separate from the close */
  gradientCalls?: number;
  gradientTokensIn?: number;
  gradientTokensOut?: number;
  /** The close completed, but no new rules were distilled because the model was unavailable. */
  gradientSkipped?: boolean;
  /** exact counts against the answer key; absent when the books carry none */
  measure?: PeriodMeasure;
  /** corrections this period that an active rule would have decided differently */
  contradictions?: Contradiction[];
  /** rules disabled because a correction contradicted them */
  suspended?: string[];
}

/** Counts, not ratios, so any rate in a report can be recomputed from them. */
export interface PeriodMeasure {
  invoices: number;
  codingCorrect: number;
  codingByRule: number;
  codingByRuleCorrect: number;
  truthMatches: number;
  matchCorrect: number;
  matchByRule: number;
  matchByRuleCorrect: number;
  bankLines: number;
  /** codings and matches proposed, by rule or by model */
  decisions: number;
  /** lines tickmarked with nobody looking */
  cleared: number;
  /** of those, how many were wrong against the answer key */
  clearedWrong: number;
}

export interface SimulationReport {
  /**
   * "model" = a real run against a real model. "mock" = the mechanism test's
   * deterministic stand-in. The UI must never present the two the same way.
   */
  provenance: "model" | "mock";
  model: ModelId;
  generatedAt: string;
  entity: string;
  periods: PeriodReport[];
  rulebook: Rule[];
  totals: { costMicros: number; llmCalls: number; ruleHits: number; touchSeconds: number };
}

/**
 * Refuse to treat a mechanism test or a degraded close as measured evidence.
 * This gate belongs next to the report type so the measured CLI and queue
 * publisher use the same definition of "measured".
 */
export function assertMeasuredReport(report: SimulationReport): void {
  if (report.provenance !== "model") {
    throw new Error(`report provenance is ${report.provenance}, not model`);
  }

  if (report.periods.length === 0) {
    throw new Error("report contains no periods");
  }

  const failures = report.periods.map((period) => period.stats.modelFailures);
  if (failures.some((count) => !Number.isInteger(count) || count < 0)) {
    throw new Error("report has invalid model-failure accounting");
  }
  const failureTotal = failures.reduce((total, count) => total + count, 0);
  if (failureTotal > 0) {
    throw new Error(`report contains ${failureTotal} failed model batch${failureTotal === 1 ? "" : "es"}`);
  }

  const skippedGradients = report.periods.filter((period) => period.gradientSkipped).length;
  if (skippedGradients > 0) {
    throw new Error(`report contains ${skippedGradients} skipped gradient step${skippedGradients === 1 ? "" : "s"}`);
  }

  if (!Number.isInteger(report.totals.llmCalls) || report.totals.llmCalls < 1) {
    throw new Error("report contains no successful model calls");
  }
}

/**
 * Flatten a run into an ordered list of decisions. Interleaved by amount so a
 * replay looks like a close being worked rather than two sorted blocks.
 */
function frames(period: ClosePeriodData, run: Awaited<ReturnType<typeof runClose>>): DecisionFrame[] {
  const exRefs = new Set(run.exceptions.map((e) => e.subjectRef));
  const out: DecisionFrame[] = [];

  for (const c of run.codings) {
    const inv = period.apInvoices.find((i) => i.invoiceNumber === c.invoiceNumber);
    out.push({
      ref: c.invoiceNumber, kind: "coding", by: c.decidedBy === "rule" ? "rule" : "agent",
      outcome: exRefs.has(c.invoiceNumber) ? "exception" : "tickmark",
      amountCents: inv?.amountCents ?? 0,
      label: `${inv?.vendorName ?? "invoice"} → ${c.glCode}`,
      confidence: c.confidence,
    });
  }
  for (const m of run.matches) {
    const ref = m.bankExternalIds.join("+");
    const total = m.bankExternalIds.reduce(
      (s, id) => s + (period.bankLines.find((b) => b.externalId === id)?.amountCents ?? 0), 0);
    // name the counterparty: a stream of bare cardinalities reads like noise,
    // a stream of vendor names reads like a close being worked
    const who = m.ledgerExternalIds
      .map((id) => period.ledgerEntries.find((e) => e.externalId === id)?.vendorName)
      .find(Boolean);
    out.push({
      ref, kind: "matching", by: m.decidedBy === "rule" ? "rule" : "agent",
      outcome: exRefs.has(ref) ? "exception" : "tickmark",
      amountCents: total,
      label: `${who ?? "bank line"} · ${m.cardinality}${m.deltaReason ? ` · ${m.deltaReason}` : ""}`,
      confidence: m.confidence,
    });
  }
  for (const e of run.exceptions) {
    if (out.some((f) => f.ref === e.subjectRef)) continue;
    out.push({
      ref: e.subjectRef, kind: e.subjectType === "accrual" ? "accrual" : "matching",
      by: "agent", outcome: "exception", amountCents: e.amountCents,
      label: e.cause.replace(/_/g, " "), confidence: e.confidence ?? 0,
    });
  }

  // deterministic shuffle so rule-hits and model calls interleave on screen
  return out.sort((a, b) => (a.ref.charCodeAt(a.ref.length - 1) % 7) - (b.ref.charCodeAt(b.ref.length - 1) % 7));
}

/** A company to close, month after month. Defaults to the bundled one. */
export interface Company {
  name: string;
  periods: GeneratedPeriod[];
  vendors: VendorSpec[];
}

export interface SimulateOptions {
  model?: ModelId;
  provenance?: "model" | "mock";
  onProgress?: (m: string) => void;
  company?: Company;
  /** share of rule decisions sent for a spot-check; see CloseInput.auditRate */
  auditRate?: number;
  /** disable a rule as soon as a correction contradicts it (default true) */
  suspendOnContradiction?: boolean;
  /** called after each close, before learning from it; for measurement only */
  onClose?: (period: GeneratedPeriod, run: Awaited<ReturnType<typeof runClose>>, rulebook: Rulebook) => void;
}

function measureRun(period: GeneratedPeriod, run: Awaited<ReturnType<typeof runClose>>): PeriodMeasure {
  const clearedRefs = new Set(run.tickmarks.map((t) => `${t.subjectType}:${t.subjectRef}`));
  let cleared = 0, clearedWrong = 0;
  for (const c of run.codings) {
    if (!clearedRefs.has(`ap_invoice:${c.invoiceNumber}`)) continue;
    cleared++;
    if (!codingIsCorrect(period, c)) clearedWrong++;
  }
  for (const m of run.matches) {
    if (!clearedRefs.has(`bank_line:${m.bankExternalIds.join("+")}`)) continue;
    cleared++;
    if (!matchIsCorrect(period, m)) clearedWrong++;
  }
  const byRuleC = run.codings.filter((c) => c.decidedBy === "rule");
  const byRuleM = run.matches.filter((m) => m.decidedBy === "rule");
  return {
    invoices: period.apInvoices.length,
    codingCorrect: run.codings.filter((c) => codingIsCorrect(period, c)).length,
    codingByRule: byRuleC.length,
    codingByRuleCorrect: byRuleC.filter((c) => codingIsCorrect(period, c)).length,
    truthMatches: period.truth.matches.length,
    matchCorrect: run.matches.filter((m) => matchIsCorrect(period, m)).length,
    matchByRule: byRuleM.length,
    matchByRuleCorrect: byRuleM.filter((m) => matchIsCorrect(period, m)).length,
    bankLines: period.bankLines.length,
    decisions: run.codings.length + run.matches.length,
    cleared, clearedWrong,
  };
}

export async function simulate(opts: SimulateOptions = {}): Promise<SimulationReport> {
  const model = opts.model ?? DEFAULT_MODEL;
  const log = opts.onProgress ?? (() => {});
  const company = opts.company ?? { name: ENTITY.name, periods: generateAll(), vendors: VENDORS };
  const all = company.periods;
  const suspend = opts.suspendOnContradiction ?? true;

  let rulebook = emptyRulebook();
  const closed: GeneratedPeriod[] = [];
  const correctionHistory: CorrectionRecord[] = [];
  const reports: PeriodReport[] = [];
  const totals = { costMicros: 0, llmCalls: 0, ruleHits: 0, touchSeconds: 0 };

  for (const period of all) {
    const versionIn = rulebook.version;
    log(`▸ ${period.code}  close run (rulebook v${versionIn}, ${rulebook.rules.filter(r => r.status === "active").length} active rules)`);

    const run = await runClose({
      period, rulebook, chart: CHART,
      history: vendorHistory(closed),
      recurringHistory: recurringHistory(closed, company.vendors),
      autoThreshold: ENTITY.autoTickmarkThreshold,
      model,
      auditRate: opts.auditRate,
    });

    opts.onClose?.(period, run, rulebook);
    const corrections: CorrectionRecord[] = controllerReview(period, run);
    correctionHistory.push(...corrections);

    // A correction that overrules an active rule disables it before anything
    // is learned from this period: the rule must not decide the next close.
    const contradictions = findContradictions(rulebook, corrections);
    const suspendedIds = suspend ? [...new Set(contradictions.map((c) => c.ruleId))] : [];
    if (suspend && contradictions.length) {
      rulebook = suspendContradicted(rulebook, contradictions);
      log(`  ${suspendedIds.length} rule(s) suspended: a correction contradicted them`);
    }
    log(`  cleared ${(run.stats.autoClearRate * 100).toFixed(0)}% · ${run.exceptions.length} exceptions · ${run.stats.llmCalls} llm calls · $${(run.stats.costMicros / 1e6).toFixed(4)}`);

    let gradientSkipped = false;
    let grad;
    try {
      // Corrections are institutional memory, not a monthly scratchpad. A
      // recurring vendor with one invoice per month earns a rule only after
      // multiple periods agree, so the gradient sees the full signed history.
      // The deterministic compiler receives all signed history. The model sees
      // only this period's residue, keeping its context bounded while still
      // allowing richer proposals where the structured compiler is silent.
      grad = await gradientStep(correctionHistory, CHART, closed, model, corrections);
    } catch (e) {
      // A provider outage must not discard the close we just completed. The
      // learning step can wait; persisting the queue cannot.
      gradientSkipped = true;
      grad = { proposals: [], usage: zeroUsage(), correctionsConsidered: corrections.length };
      log(`  gradient skipped · model unavailable (${String((e as Error).message).slice(0, 100)})`);
    }
    const accepted = grad.proposals.filter(wouldAdopt);
    rulebook = applyToRulebook(rulebook, accepted);
    const activated = new Set(
      rulebook.rules.filter((r) => r.status === "active" && accepted.some((a) => a.id === r.id)).map((r) => r.id),
    );
    const duplicates = new Set(
      rulebook.rules.filter((r) => r.duplicateOf && accepted.some((a) => a.id === r.id)).map((r) => r.id),
    );
    if (grad.proposals.length) log(`  gradient: ${grad.proposals.length} proposed, ${activated.size} adopted → rulebook v${rulebook.version}`);

    const touch = touchSeconds(corrections.length);
    totals.costMicros += run.stats.costMicros + grad.usage.costMicros;
    totals.llmCalls += run.stats.llmCalls + grad.usage.calls;
    totals.ruleHits += run.stats.ruleHits;
    totals.touchSeconds += touch;

    reports.push({
      period: period.code,
      rulebookVersionIn: versionIn,
      rulebookVersionOut: rulebook.version,
      activeRules: rulebook.rules.filter((r) => r.status === "active").length,
      modelDecisions:
        run.codings.filter((c) => c.decidedBy === "agent").length +
        run.matches.filter((m) => m.decidedBy === "agent").length,
      exceptions: run.exceptions,
      decisions: frames(period, run),
      stats: run.stats,
      corrections: corrections.length,
      touchSeconds: touch,
      gradientCostMicros: grad.usage.costMicros,
      gradientCalls: grad.usage.calls,
      gradientTokensIn: grad.usage.tokensIn,
      gradientTokensOut: grad.usage.tokensOut,
      gradientSkipped,
      measure: measureRun(period, run),
      contradictions,
      suspended: suspendedIds,
      proposals: grad.proposals.map((p) => ({
        name: p.name, kind: p.kind, adopted: activated.has(p.id), duplicate: duplicates.has(p.id),
        precision: p.backtest?.precision ?? 0, fired: p.backtest?.wouldHaveFired ?? 0,
        evidence: p.evidence.length,
      })),
    });

    closed.push(period);
  }

  return {
    provenance: opts.provenance ?? "model",
    model: opts.provenance === "mock" ? model : effectiveModelId(model), generatedAt: new Date().toISOString(), entity: company.name,
    periods: reports, rulebook: rulebook.rules, totals,
  };
}
