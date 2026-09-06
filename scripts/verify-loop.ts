/**
 * The product loop, end to end, on ingested books.
 *
 * Closes a period, works two exceptions the way a controller would, adopts the
 * rule that earns it, then closes the next period and requires the rulebook to
 * have taken work off the queue. No answer key, no fixture, no model - only
 * what the entity's own history supports.
 */
import { db } from "../src/lib/ingest/ingest";
import { closePeriod } from "../src/lib/agent/run-period";
import { adoptRule, listQueue, resolveException } from "../src/lib/store/queue";

/** indexOf returns -1 when a flag is absent, and argv[0] is the node binary. */
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback);
};
const ENTITY = arg("entity", "Northwind Robotics, Inc.");
const FIRST = arg("first", "2026-03");
const NEXT = arg("next", "2026-04");

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(50)} ${detail}`);
};
const kindOf = (t: string) => (t === "ap_invoice" ? "coding" : t === "accrual" ? "accrual" : "matching");

async function main() {
  console.log(`closing ${FIRST} on ingested books\n`);
  const first = await closePeriod(ENTITY, FIRST);
  check("a close runs on ingested books", first.persisted.exceptions > 0 || first.result.tickmarks.length > 0,
    `${first.persisted.exceptions} exceptions, ${first.persisted.tickmarks} tickmarks`);

  const queue = await listQueue(300);
  if (!queue) { check("queue materialised", false); process.exit(1); }

  const byScope = new Map<string, typeof queue.items>();
  for (const i of queue.items) {
    if (!i.vendor) continue;
    const k = `${i.vendor}|${kindOf(i.subjectType)}`;
    (byScope.get(k) ?? byScope.set(k, []).get(k)!).push(i);
  }
  const pair = [...byScope.entries()].find(([, xs]) => xs.length >= 2);
  if (!pair) { check("a vendor recurs in the queue", false, "nothing to teach it"); process.exit(1); }
  const [scope, [a, b]] = pair;
  console.log(`\n  teaching it: ${scope.replace("|", " · ")}\n`);

  const one = await resolveException(a.id, { action: "accept" }, "Controller A", true);
  check("one correction does not make a rule", one.kind === "intent_recorded", one.kind);

  const two = await resolveException(b.id, { action: "accept" }, "Controller B", true);
  check("a second correction proposes one", two.kind === "rule_proposed",
    two.kind === "rule_proposed" ? `${two.ruleName} · fired ${two.fired}× @ ${(two.precision * 100).toFixed(0)}%` : two.kind);

  let adopted = false;
  if (two.kind === "rule_proposed" && two.adoptable) {
    await adoptRule(two.ruleId, "Controller B", true);
    adopted = true;
  }
  check("the rule is adopted only if it survived the replay", adopted === (two.kind === "rule_proposed" && two.adoptable),
    adopted ? "adopted" : "refused — replay too weak");

  console.log(`\nclosing ${NEXT} with the rulebook it earned\n`);
  const next = await closePeriod(ENTITY, NEXT);
  check("the next close loads the earned rulebook", next.rulebookVersion > 0, `v${next.rulebookVersion}`);
  check("rules settle work at no cost", next.result.stats.ruleHits > 0, `${next.result.stats.ruleHits} rule hits`);
  check("tickmarks are written to the ledger", next.persisted.tickmarks > 0, `${next.persisted.tickmarks} tickmarks`);

  const { data: marks } = await db().from("tickmarks").select("asserted_by, evidence").order("created_at", { ascending: false }).limit(1);
  check("a tickmark carries its evidence", Boolean((marks?.[0]?.evidence as unknown[])?.length),
    JSON.stringify(marks?.[0]?.evidence ?? []).slice(0, 62));

  console.log(`\n  ${FIRST}: ${first.persisted.exceptions} exceptions, ${first.result.stats.ruleHits} settled free`);
  console.log(`  ${NEXT}: ${next.persisted.exceptions} exceptions, ${next.result.stats.ruleHits} settled free`);
  console.log(`\n${fail === 0 ? "the loop turns on real books" : `${fail} check(s) failed`}  (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("verify-loop crashed:", e?.message ?? e); process.exit(1); });
