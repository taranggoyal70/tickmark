/**
 * Proves the evidence gate end to end against the live database.
 *
 * Resolving one exception for a vendor must NOT create a rule. Resolving a
 * second for the same vendor must. This is the core claim of the product, so it
 * is tested rather than asserted.
 */
import { createClient } from "@supabase/supabase-js";
import { adoptRule, listQueue, resolveException } from "../src/lib/store/queue";

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(52)} ${detail}`);
};

async function main() {
  const queue = await listQueue(200);
  if (!queue) { console.error("no open queue — run `npm run publish` first."); process.exit(1); }

  // Two open exceptions sharing a vendor AND a decision kind. A standing intent
  // is scoped to both, because a coding judgment says nothing about how the same
  // vendor settles on the bank.
  const kindOf = (t: string) => (t === "ap_invoice" ? "coding" : t === "accrual" ? "accrual" : "matching");
  const byScope = new Map<string, typeof queue.items>();
  for (const i of queue.items) {
    if (!i.vendor) continue;
    const k = `${i.vendor}|${kindOf(i.subjectType)}`;
    (byScope.get(k) ?? byScope.set(k, []).get(k)!).push(i);
  }
  const pair = [...byScope.entries()].find(([, xs]) => xs.length >= 2);
  if (!pair) { console.error("need two open exceptions sharing a vendor and kind; re-publish the queue."); process.exit(1); }
  const [scopeKey, [first, second]] = pair;
  const vendor = scopeKey.split("|")[0];
  console.log(`  scope under test: ${scopeKey.replace("|", " · ")}\n`);

  const before = await db.from("rules").select("id", { count: "exact", head: true });

  const one = await resolveException(first.id, { action: "accept" }, "Controller A", true);
  check("first 'always do this' does NOT create a rule", one.kind === "intent_recorded", `outcome: ${one.kind}`);

  const mid = await db.from("rules").select("id", { count: "exact", head: true });
  check("rule count unchanged after one correction", mid.count === before.count, `${before.count} → ${mid.count}`);

  const two = await resolveException(second.id, { action: "accept" }, "Controller B", true);
  check("second correction proposes a rule", two.kind === "rule_proposed",
    two.kind === "rule_proposed" ? `${two.ruleName} · fired ${two.fired}× @ ${(two.precision * 100).toFixed(0)}%` : two.kind);

  if (two.kind === "rule_proposed") {
    const { data: r } = await db.from("rules").select("status, evidence, self_evidenced, adopted_by, backtest").eq("id", two.ruleId).single();
    check("proposed rule is not active until adopted", r?.status === "proposed", `status: ${r?.status}`);
    check("rule cites 2 distinct corrections", (r?.evidence as unknown[])?.length === 2, `${(r?.evidence as unknown[])?.length} citations`);
    check("rule carries a backtest", r?.backtest !== null, "replayed against closed periods");
    check("two different controllers → not self-evidenced", r?.self_evidenced === false, `self_evidenced: ${r?.self_evidenced}`);

    check("proposal reports whether it clears the adoption bar", typeof two.adoptable === "boolean",
      two.adoptable ? "clears the bar" : "below the bar — UI will refuse adoption");

    const { error: anon } = await db.from("rules").update({ status: "active" }).eq("id", two.ruleId);
    check("activating without an approver is refused", anon !== null,
      anon ? `rejected: ${anon.message.slice(0, 48)}` : "NOT REJECTED — invariant 9 unenforced");

    // the path the UI actually calls, not a raw write around it
    let refused: string | null = null;
    try {
      await adoptRule(two.ruleId, "Controller B", true);
    } catch (e) { refused = (e as Error).message; }

    if (two.adoptable) {
      check("adoptRule accepts a rule that cleared the replay", refused === null, refused ?? "active, attributed");
    } else {
      check("adoptRule refuses a rule that failed the replay", refused !== null,
        refused ? refused.slice(0, 72) : "NOT REFUSED — a rule that fires on nothing was adoptable");
    }
  }

  // leave the queue exactly as it was found, so the demo is repeatable
  if (two.kind === "rule_proposed") await db.from("rules").delete().eq("id", two.ruleId);
  await db.from("standing_intents").delete().contains("scope", { vendor });
  await db.from("corrections").delete().in("exception_id", [first.id, second.id]);
  await db.from("exceptions").update({ status: "open", resolved_at: null }).in("id", [first.id, second.id]);
  console.log("\n  test rows removed; queue restored");

  console.log(`\n${fail === 0 ? "the evidence gate holds" : `${fail} check(s) failed`}  (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("verify-gate crashed:", e?.message ?? e); process.exit(1); });
