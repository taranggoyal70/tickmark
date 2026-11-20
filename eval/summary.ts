/**
 * The eval's result types and the held-out summary, with no runtime
 * dependencies, so the app can render committed results without importing the
 * harness. eval/run.ts writes these shapes; everything else only reads them.
 */
import type { ADOPTION } from "../src/lib/agent/gradient";

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
