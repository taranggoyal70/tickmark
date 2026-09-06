/**
 * Headless eval run. Every number the dashboard shows comes from here.
 *
 *   npx tsx --env-file=.env.local scripts/simulate.ts [--model anthropic/claude-sonnet-5]
 */
import { simulate } from "../src/lib/agent/simulate";
import { fmtUsd, MODELS, rateFor, type ModelId } from "../src/lib/agent/pricing";
import { effectiveModelId, providerLabel } from "../src/lib/agent/provider";
import { getStore } from "../src/lib/store";
import { flushTracing, tracingLabel } from "../src/lib/agent/tracing";

function parseModel(): ModelId | undefined {
  const i = process.argv.indexOf("--model");
  if (i === -1) return undefined;
  const v = process.argv[i + 1];
  if (!v) { console.error("--model needs a value"); process.exit(2); }
  // A custom endpoint serves whatever it serves; only the built-in ids are checked.
  if (!(v in MODELS) && !process.env.TICKMARK_BASE_URL) {
    console.error(`unknown model "${v}". known: ${Object.keys(MODELS).join(", ")}`);
    console.error("(set TICKMARK_BASE_URL to use a model served by another endpoint)");
    process.exit(2);
  }
  return v as ModelId;
}

async function main() {
  const model = parseModel();
  const effective = effectiveModelId(model ?? "anthropic/claude-opus-5");
  const rate = rateFor(effective);
  console.log(`provider: ${providerLabel()}`);
  console.log(`tracing:  ${tracingLabel()}`);
  console.log(`model:    ${effective}  ($${rate.inPerMTok}/$${rate.outPerMTok} per MTok)`);
  if (rate.inPerMTok === 0 && rate.outPerMTok === 0) {
    console.log("          no price configured, so cost reports as $0.00 - set TICKMARK_PRICE_IN/OUT to price it");
  }
  const report = await simulate({ model, onProgress: (m) => console.log(m) });

  console.log("\n─────────────────────────────────────────────────────────────────────");
  console.log("period   cleared  coding  match   exc  llm  rules  cost      touch");
  for (const p of report.periods) {
    const s = p.stats;
    console.log(
      [
        p.period.padEnd(8),
        `${(s.autoClearRate * 100).toFixed(0)}%`.padStart(7),
        `${(s.codingAccuracy * 100).toFixed(0)}%`.padStart(7),
        `${(s.matchAccuracy * 100).toFixed(0)}%`.padStart(6),
        String(s.exceptionsOpened).padStart(5),
        String(s.llmCalls).padStart(4),
        String(s.ruleHits).padStart(6),
        fmtUsd(s.costMicros).padStart(9),
        `${Math.round(p.touchSeconds / 60)}m`.padStart(6),
      ].join(" "),
    );
  }
  const first = report.periods[0], last = report.periods[report.periods.length - 1];
  console.log("─────────────────────────────────────────────────────────────────────");
  console.log(`auto-clear   ${(first.stats.autoClearRate * 100).toFixed(0)}% → ${(last.stats.autoClearRate * 100).toFixed(0)}%`);
  console.log(`cost/close   ${fmtUsd(first.stats.costMicros)} → ${fmtUsd(last.stats.costMicros)}`);
  console.log(`controller   ${Math.round(first.touchSeconds / 60)}m → ${Math.round(last.touchSeconds / 60)}m`);
  console.log(`precision    ${(first.stats.autoClearPrecision * 100).toFixed(1)}% → ${(last.stats.autoClearPrecision * 100).toFixed(1)}%  (must not fall)`);
  console.log(`rulebook     v${first.rulebookVersionIn} → v${last.rulebookVersionOut}, ${last.activeRules} active rules`);

  const store = await getStore();
  await store.saveReport(report);
  console.log(`\nsaved via ${store.kind} store`);
  // a short CLI run exits before the exporter drains on its own
  await flushTracing();
}

main().catch((e) => { console.error("\nrun failed:", e?.message ?? e); process.exit(1); });
