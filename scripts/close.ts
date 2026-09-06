/**
 * Close a period against books that were actually ingested.
 *
 *   npm run close -- --entity "Northwind Robotics, Inc." --period 2026-04
 *
 * Unlike the eval harness this reads the entity's real data, applies the
 * Rulebook it has actually earned, and writes back what it decided: tickmarks,
 * a queue, and accrual entries drafted for approval.
 */
import { closePeriod } from "../src/lib/agent/run-period";
import { fmtUsd, MODELS, type ModelId } from "../src/lib/agent/pricing";
import { effectiveModelId, providerLabel } from "../src/lib/agent/provider";
import { flushTracing } from "../src/lib/agent/tracing";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? undefined : process.argv[i + 1];
};

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("a real close writes to the ledger: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(2);
  }
  const entity = arg("entity"), period = arg("period");
  if (!entity || !period) { console.error('need --entity "<name>" --period <YYYY-MM>'); process.exit(2); }

  const requested = (arg("model") ?? undefined) as ModelId | undefined;
  if (requested && !(requested in MODELS) && !process.env.TICKMARK_BASE_URL) {
    console.error(`unknown model "${requested}". known: ${Object.keys(MODELS).join(", ")}`);
    process.exit(2);
  }

  console.log(`entity   ${entity}`);
  console.log(`period   ${period}`);
  console.log(`provider ${providerLabel()} · ${effectiveModelId(requested ?? "anthropic/claude-opus-5")}\n`);

  const { result, persisted, rulebookVersion } = await closePeriod(entity, period, requested);
  const s = result.stats;

  console.log(`rulebook v${rulebookVersion} · ${s.ruleHits} decisions settled by rule at no cost`);
  console.log(`cleared  ${(s.autoClearRate * 100).toFixed(0)}% of ${result.codings.length + result.matches.length} decisions`);
  console.log(`queue    ${persisted.exceptions} exceptions opened for review`);
  console.log(`ledger   ${persisted.tickmarks} tickmarks written, ${persisted.journalEntries} accrual entries drafted`);
  console.log(`cost     ${fmtUsd(s.costMicros)} across ${s.llmCalls} model calls in ${(s.durationMs / 1000).toFixed(1)}s`);
  if (!s.scored) console.log(`\nno answer key on these books, so accuracy is not reported — only what was done.`);
  await flushTracing();
}

main().catch((e) => { console.error("\nclose failed:", e?.message ?? e); process.exit(1); });
