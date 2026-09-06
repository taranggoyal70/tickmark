/**
 * Materialise the latest measured run's exception queue into the database so a
 * controller can actually work it. Re-running replaces the open queue.
 *
 *   npm run publish
 */
import { getStore } from "../src/lib/store";
import { publishRun, queueEnabled } from "../src/lib/store/queue";

async function main() {
  if (!queueEnabled()) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to publish a queue.");
    process.exit(2);
  }
  const report = await (await getStore()).loadLatest();
  if (!report) { console.error("no run on record — run `npm run simulate` first."); process.exit(1); }

  const lastN = Number(process.argv[process.argv.indexOf("--periods") + 1]) || 1;
  const { opened } = await publishRun(report, { lastN });
  const opened_periods = report.periods.slice(-lastN).map((p) => p.period).join(", ");
  console.log(`published ${opened_periods} (provenance: ${report.provenance})`);
  console.log(`  ${opened} exceptions opened for review`);
}

main().catch((e) => { console.error("publish failed:", e?.message ?? e); process.exit(1); });
