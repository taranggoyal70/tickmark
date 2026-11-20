import "server-only";
import offlineJson from "../../eval/results/offline.json";
import gptJson from "../../eval/results/model-gpt-6.2-sol.json";
import llamaJson from "../../eval/results/model-llama3.2-latest.json";
import { heldOutByClose, type EvalResults } from "../../eval/summary";

/**
 * The committed eval results, shaped for the landing page. Bundled at build
 * time, so the page shows exactly what `npm run eval -- --check` reproduces and
 * needs no database or model key to render.
 */

const offline = offlineJson as unknown as EvalResults;

export interface CloseSummary {
  close: number;
  period: string;
  /** coding decisions plus bank matches the close had to make */
  decisions: number;
  /** of those, settled by a compiled rule with no model call */
  byRule: number;
  /** close calls plus gradient calls */
  modelCalls: number;
  tokens: number;
  cleared: number;
  clearedWrong: number;
  exceptions: number;
  activeRulesIn: number;
}

function summarize(r: EvalResults): { companies: number; closes: CloseSummary[] } {
  const rows = heldOutByClose(r, 2);
  return {
    companies: rows[0]?.companies ?? 0,
    closes: rows.map((x) => ({
      close: x.close,
      period: x.period,
      decisions: x.invoices + x.truthMatches,
      byRule: x.codingByRule + x.matchByRule,
      modelCalls: x.modelCalls + x.gradientCalls,
      tokens: x.tokensIn + x.tokensOut,
      cleared: x.cleared,
      clearedWrong: x.clearedWrong,
      exceptions: x.exceptions,
      activeRulesIn: x.activeRulesIn,
    })),
  };
}

/** Held-out round 2 with the deterministic stand-in model. */
export function offlineHeldOut() {
  return { ...summarize(offline), provider: offline.provider, tokenCounts: offline.tokenCounts };
}

export interface ModelRun {
  model: string;
  provider: string;
  companies: number;
  closes: CloseSummary[];
}

/** Held-out round 2 with real models: a frontier model through an API, then a 3B model on a laptop. */
export function modelRuns(): ModelRun[] {
  return [gptJson, llamaJson].map((json) => {
    const r = json as unknown as EvalResults;
    return { model: r.model, provider: r.provider, ...summarize(r) };
  });
}
