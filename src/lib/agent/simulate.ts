/**
 * The eval harness: run the same close, month after month, and watch what the
 * learning loop does to the numbers. Nothing here is staged - every figure in
 * the report is measured from a real run against ground truth the agent cannot
 * see.
 */
import { generateAll, type GeneratedPeriod } from "../seed/generate";
import { DEPARTMENTS, ENTITY, GL_ACCOUNTS, VENDORS } from "../seed/fixture";
import { runClose } from "./close";
import { controllerReview, touchSeconds } from "./controller";
import { applyToRulebook, gradientStep, wouldAdopt, type CorrectionRecord } from "./gradient";
import type { ChartContext, VendorHistoryRow } from "./llm";
import { DEFAULT_MODEL, type ModelId } from "./pricing";
import { effectiveModelId } from "./provider";
import { emptyRulebook } from "./rules";
import { splitKey } from "./close";
import type { ClosePeriodData, Exception, Rule, RunStats } from "./types";

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

function recurringHistory(closed: GeneratedPeriod[]): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  const recurring = new Set(VENDORS.filter((v) => v.recurring && v.cadence === "monthly" && !v.quirk).map((v) => v.name));
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
  proposals: { name: string; kind: string; adopted: boolean; precision: number; fired: number; evidence: number }[];
  gradientCostMicros: number;
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

export async function simulate(opts: { model?: ModelId; provenance?: "model" | "mock"; onProgress?: (m: string) => void } = {}): Promise<SimulationReport> {
  const model = opts.model ?? DEFAULT_MODEL;
  const log = opts.onProgress ?? (() => {});
  const all = generateAll();

  let rulebook = emptyRulebook();
  const closed: GeneratedPeriod[] = [];
  const reports: PeriodReport[] = [];
  const totals = { costMicros: 0, llmCalls: 0, ruleHits: 0, touchSeconds: 0 };

  for (const period of all) {
    const versionIn = rulebook.version;
    log(`▸ ${period.code}  close run (rulebook v${versionIn}, ${rulebook.rules.filter(r => r.status === "active").length} active rules)`);

    const run = await runClose({
      period, rulebook, chart: CHART,
      history: vendorHistory(closed),
      recurringHistory: recurringHistory(closed),
      autoThreshold: ENTITY.autoTickmarkThreshold,
      model,
    });

    const corrections: CorrectionRecord[] = controllerReview(period, run);
    log(`  cleared ${(run.stats.autoClearRate * 100).toFixed(0)}% · ${run.exceptions.length} exceptions · ${run.stats.llmCalls} llm calls · $${(run.stats.costMicros / 1e6).toFixed(4)}`);

    const grad = await gradientStep(corrections, CHART, closed, model);
    const accepted = grad.proposals.filter(wouldAdopt);
    rulebook = applyToRulebook(rulebook, accepted);
    if (grad.proposals.length) log(`  gradient: ${grad.proposals.length} proposed, ${accepted.length} adopted → rulebook v${rulebook.version}`);

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
      proposals: grad.proposals.map((p) => ({
        name: p.name, kind: p.kind, adopted: accepted.includes(p),
        precision: p.backtest?.precision ?? 0, fired: p.backtest?.wouldHaveFired ?? 0,
        evidence: p.evidence.length,
      })),
    });

    closed.push(period);
  }

  return {
    provenance: opts.provenance ?? "model",
    model: opts.provenance === "mock" ? model : effectiveModelId(model), generatedAt: new Date().toISOString(), entity: ENTITY.name,
    periods: reports, rulebook: rulebook.rules, totals,
  };
}
