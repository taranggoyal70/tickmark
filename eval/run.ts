/**
 * The month-end close eval.
 *
 *   npm run eval                     offline baseline, every company, writes eval/results/offline.json
 *   npm run eval -- --check          rerun offline and fail if any number differs from the committed file
 *   npm run eval -- --model          the configured real model (see .env.example); writes eval/results/model-<id>.json
 *   npm run eval -- --only dev       restrict to dev | held-out | round1 | round2 | drift (comma separated)
 *
 * Each company is closed six times in a row. After every close the simulated
 * controller works the exception queue from the answer key, the gradient step
 * compiles corrections into proposed rules, and a rule is adopted only if its
 * replay clears the adoption bar. Nothing reviews what the agent cleared
 * unattended; those lines are scored against the answer key instead.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codingIsCorrect } from "../src/lib/agent/close";
import { ADOPTION } from "../src/lib/agent/gradient";
import { costMicros, DEFAULT_MODEL, rateFor } from "../src/lib/agent/pricing";
import { effectiveModelId, providerLabel, setModelOverride } from "../src/lib/agent/provider";
import { simulate, type PeriodReport, type SimulationReport } from "../src/lib/agent/simulate";
import { ENTITY } from "../src/lib/seed/fixture";
import { baselineModel } from "./baseline-model";
import { DRIFT, EVAL_PERIODS, HELD_OUT_SEEDS, devCompany, driftCompany, heldOutCompany, type EvalCompany } from "./companies";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = path.join(HERE, "results");

/** List price the offline token estimates are priced at, from src/lib/agent/pricing.ts. */
const LIST_PRICE_MODEL = DEFAULT_MODEL;

/** The audit rates the policy-change scenario compares. Fixed before the first run. */
export const DRIFT_AUDIT_RATES = [0, 0.25] as const;

export interface CloseRow {
  close: number;
  period: string;
  activeRulesIn: number;
  activeRulesOut: number;
  modelCalls: number;
  gradientCalls: number;
  /** close plus gradient */
  tokensIn: number;
  tokensOut: number;
  /** close plus gradient, priced at LIST_PRICE_MODEL's list price */
  costMicrosAtListPrice: number;
  invoices: number;
  codingCorrect: number;
  codingByRule: number;
  codingByRuleCorrect: number;
  truthMatches: number;
  matchCorrect: number;
  matchByRule: number;
  matchByRuleCorrect: number;
  bankLines: number;
  decisions: number;
  cleared: number;
  clearedWrong: number;
  exceptions: number;
  corrections: number;
  contradictions: number;
  suspended: number;
  modelFailures: number;
}

export interface CompanyResult {
  id: string;
  split: "dev" | "held-out";
  round?: 1 | 2;
  seed: number;
  name: string;
  auditRate: number;
  closes: CloseRow[];
  /** later corrections an active rule would have decided differently */
  contradictions: { period: string; ruleSaid: string; humanSaid: string; subject: string }[];
  drift?: { vendor: string; fromPeriod: string; perClose: { period: string; invoices: number; byRule: number; clearedWrong: number; corrected: number }[] };
}

export interface EvalResults {
  schema: 1;
  mode: "offline-baseline" | "model";
  model: string;
  provider: string;
  tokenCounts: "estimated (characters / 4)" | "reported by the provider";
  listPrice: { model: string; inPerMTok: number; outPerMTok: number };
  periods: readonly string[];
  adoption: typeof ADOPTION;
  autoThreshold: number;
  heldOutSeeds: readonly number[];
  companies: CompanyResult[];
  generatedAt?: string;
}

function rows(report: SimulationReport): CloseRow[] {
  return report.periods.map((p: PeriodReport, i): CloseRow => {
    const m = p.measure!;
    const prevActive = i === 0 ? 0 : report.periods[i - 1].activeRules;
    const tin = p.stats.tokensIn + (p.gradientTokensIn ?? 0);
    const tout = p.stats.tokensOut + (p.gradientTokensOut ?? 0);
    return {
      close: i + 1, period: p.period,
      activeRulesIn: prevActive, activeRulesOut: p.activeRules,
      modelCalls: p.stats.llmCalls, gradientCalls: p.gradientCalls ?? 0,
      tokensIn: tin, tokensOut: tout,
      costMicrosAtListPrice: costMicros(LIST_PRICE_MODEL, tin, tout),
      invoices: m.invoices, codingCorrect: m.codingCorrect,
      codingByRule: m.codingByRule, codingByRuleCorrect: m.codingByRuleCorrect,
      truthMatches: m.truthMatches, matchCorrect: m.matchCorrect,
      matchByRule: m.matchByRule, matchByRuleCorrect: m.matchByRuleCorrect,
      bankLines: m.bankLines,
      decisions: m.decisions,
      cleared: m.cleared, clearedWrong: m.clearedWrong,
      exceptions: p.stats.exceptionsOpened, corrections: p.corrections,
      contradictions: p.contradictions?.length ?? 0, suspended: p.suspended?.length ?? 0,
      modelFailures: p.stats.modelFailures,
    };
  });
}

async function runCompany(company: EvalCompany, mode: EvalResults["mode"], auditRate: number, log: (s: string) => void): Promise<CompanyResult> {
  const drift = company.drift;
  const perClose: NonNullable<CompanyResult["drift"]>["perClose"] = [];
  const report = await simulate({
    company, auditRate, provenance: mode === "model" ? "model" : "mock",
    onProgress: (s) => log(`    ${s}`),
    onClose: (period, run) => {
      if (!drift) return;
      const mine = period.apInvoices.filter((inv) => inv.vendorName === drift.vendor);
      const refs = new Set(mine.map((inv) => inv.invoiceNumber));
      const cleared = new Set(run.tickmarks.filter((t) => t.subjectType === "ap_invoice").map((t) => t.subjectRef));
      const byRule = run.codings.filter((c) => refs.has(c.invoiceNumber) && c.decidedBy === "rule");
      perClose.push({
        period: period.code, invoices: mine.length, byRule: byRule.length,
        clearedWrong: byRule.filter((c) => cleared.has(c.invoiceNumber) && !codingIsCorrect(period, c)).length,
        corrected: run.exceptions.filter((e) => refs.has(e.subjectRef)).length,
      });
    },
  });
  return {
    id: auditRate > 0 ? `${company.id}-audit${Math.round(auditRate * 100)}` : company.id,
    split: company.split, ...(company.round ? { round: company.round } : {}), seed: company.seed, name: company.name, auditRate,
    closes: rows(report),
    contradictions: report.periods.flatMap((p) => (p.contradictions ?? []).map((c) => ({
      period: p.period, ruleSaid: c.ruleSaid, humanSaid: c.humanSaid, subject: c.subject,
    }))),
    ...(drift ? { drift: { vendor: drift.vendor, fromPeriod: EVAL_PERIODS[drift.fromIndex], perClose } } : {}),
  };
}

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

export async function runEval(mode: EvalResults["mode"], only: Set<string>, log: (s: string) => void): Promise<EvalResults> {
  if (mode === "offline-baseline") setModelOverride(() => baselineModel());

  const jobs: { company: EvalCompany; audit: number }[] = [];
  if (only.has("dev")) jobs.push({ company: devCompany(), audit: 0 });
  for (const seed of HELD_OUT_SEEDS) {
    const c = heldOutCompany(seed);
    if (only.has("held-out") || only.has(`round${c.round}`)) jobs.push({ company: c, audit: 0 });
  }
  if (only.has("drift")) {
    const c = driftCompany();
    const before = c.vendors.find((v) => v.name === DRIFT.vendor)!;
    if (before.glCode === DRIFT.glCode && JSON.stringify(before.deptSplit) === JSON.stringify(DRIFT.deptSplit)) {
      throw new Error("the drift scenario changes nothing for this seed; pick another vendor");
    }
    for (const audit of DRIFT_AUDIT_RATES) jobs.push({ company: driftCompany(), audit });
  }

  const companies: CompanyResult[] = [];
  for (const { company, audit } of jobs) {
    log(`▸ ${company.name}${audit ? ` · audit ${audit * 100}% of rule decisions` : ""}`);
    companies.push(await runCompany(company, mode, audit, log));
  }

  const served = mode === "model" ? effectiveModelId(DEFAULT_MODEL) : "offline-baseline";
  const rate = rateFor(LIST_PRICE_MODEL);
  return {
    schema: 1, mode, model: String(served),
    provider: mode === "model" ? providerLabel() : "none (deterministic stand-in, see eval/baseline-model.ts)",
    tokenCounts: mode === "model" ? "reported by the provider" : "estimated (characters / 4)",
    listPrice: { model: String(LIST_PRICE_MODEL), inPerMTok: rate.inPerMTok, outPerMTok: rate.outPerMTok },
    periods: EVAL_PERIODS, adoption: ADOPTION, autoThreshold: ENTITY.autoTickmarkThreshold,
    heldOutSeeds: HELD_OUT_SEEDS, companies,
  };
}

// ── summaries ────────────────────────────────────────────────────────────────

/** One decimal, truncated: a reported share is never rounded up. */
const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${(Math.floor((1000 * n) / d) / 10).toFixed(1)}%`);

/** Held-out companies summed close by close, so every rate has its counts. */
export function heldOutByClose(r: EvalResults, round: 1 | 2 = 2) {
  const held = r.companies.filter((c) => c.split === "held-out" && c.round === round && !c.drift && c.auditRate === 0);
  return r.periods.map((period, i) => {
    const cs = held.map((c) => c.closes[i]);
    const sum = (k: keyof CloseRow) => cs.reduce((s, c) => s + (c[k] as number), 0);
    return {
      close: i + 1, period, companies: cs.length,
      activeRulesIn: sum("activeRulesIn"), modelCalls: sum("modelCalls"), gradientCalls: sum("gradientCalls"),
      tokensIn: sum("tokensIn"), tokensOut: sum("tokensOut"), costMicros: sum("costMicrosAtListPrice"),
      invoices: sum("invoices"), codingCorrect: sum("codingCorrect"), codingByRule: sum("codingByRule"), codingByRuleCorrect: sum("codingByRuleCorrect"),
      truthMatches: sum("truthMatches"), matchCorrect: sum("matchCorrect"), matchByRule: sum("matchByRule"), matchByRuleCorrect: sum("matchByRuleCorrect"),
      cleared: sum("cleared"), clearedWrong: sum("clearedWrong"), exceptions: sum("exceptions"),
      contradictions: sum("contradictions"),
    };
  });
}

export function printSummary(r: EvalResults, log: (s: string) => void) {
  log(`\nmode ${r.mode} · model ${r.model} · tokens ${r.tokenCounts}`);
  for (const c of r.companies) {
    log(`\n${c.name}${c.auditRate ? ` (audit ${c.auditRate * 100}%)` : ""}`);
    log("close  rules  calls  coding  by-rule  match  by-rule  cleared  wrong  exc  contra");
    for (const x of c.closes) {
      log([
        String(x.close).padStart(5), String(x.activeRulesIn).padStart(6), String(x.modelCalls + x.gradientCalls).padStart(6),
        pct(x.codingCorrect, x.invoices).padStart(7), pct(x.codingByRule, x.invoices).padStart(8),
        pct(x.matchCorrect, x.truthMatches).padStart(6), pct(x.matchByRule, x.truthMatches).padStart(8),
        String(x.cleared).padStart(8), String(x.clearedWrong).padStart(6), String(x.exceptions).padStart(4),
        String(x.contradictions).padStart(7),
      ].join(" "));
    }
    if (c.drift) for (const d of c.drift.perClose) log(`  ${c.drift.vendor} ${d.period}: ${d.invoices} invoices, ${d.byRule} by rule, ${d.clearedWrong} wrong and unreviewed, ${d.corrected} reviewed`);
  }
}

/** Only the measured content; the timestamp is allowed to differ. */
const comparable = (r: EvalResults) => JSON.stringify({ ...r, generatedAt: undefined }, null, 2);

async function main() {
  const mode: EvalResults["mode"] = process.argv.includes("--model") ? "model" : "offline-baseline";
  const only = new Set((arg("only") ?? "dev,held-out,drift").split(","));
  const check = process.argv.includes("--check");
  const quiet = check || process.argv.includes("--quiet");
  const log = quiet ? () => {} : (s: string) => console.log(s);

  const results = await runEval(mode, only, log);
  const file = path.join(RESULTS, mode === "model" ? `model-${results.model.replace(/[^a-z0-9.]+/gi, "-")}.json` : "offline.json");

  if (check) {
    const committed = JSON.parse(await readFile(file, "utf8")) as EvalResults;
    if (comparable(committed) !== comparable(results)) {
      console.error(`eval: results differ from ${path.relative(process.cwd(), file)}; rerun "npm run eval" and commit the change`);
      process.exit(1);
    }
    console.log(`eval: ${results.companies.length} runs reproduce ${path.relative(process.cwd(), file)} exactly`);
    return;
  }

  printSummary(results, (s) => console.log(s));
  await mkdir(RESULTS, { recursive: true });
  await writeFile(file, JSON.stringify({ ...results, generatedAt: new Date().toISOString() }, null, 2) + "\n");
  console.log(`\nwrote ${path.relative(process.cwd(), file)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error("eval failed:", e?.message ?? e); process.exit(1); });
}
