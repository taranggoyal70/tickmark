/**
 * Books belong to the people who imported them.
 *
 *   npm run verify:tenancy
 *
 * Runs against the database in SUPABASE_URL as two made-up users and checks
 * every path the app uses to read or change books: what a signed-out visitor
 * sees, what each user sees, and that every write refuses rows from the other
 * user's books. It also checks the per-person close allowance, that a decided
 * journal entry stays decided, and, when SUPABASE_ANON_KEY is set, that the
 * public key cannot call the functions that take a user id.
 *
 * Everything it creates is removed at the end. It reads the demo company but
 * never writes to it.
 */
import { createClient } from "@supabase/supabase-js";
import { booksFor, claimCloseSlot, ensureOwnedEntity, memberEntityIds } from "../src/lib/access";
import { db, findOperatorEntity, ingestPeriod } from "../src/lib/ingest/ingest";
import { decideEntry, listEntries } from "../src/lib/store/entries";
import { adoptRule, listQueue, resolveException } from "../src/lib/store/queue";

const run = Date.now().toString(36);
const A = `verify_tenancy_a_${run}`;
const B = `verify_tenancy_b_${run}`;
const NAME = "Tenancy Test Co.";
const DEMO = "Northwind Robotics, Inc.";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(62)} ${detail}`);
};
const refuses = async (f: () => Promise<unknown>) => {
  try { await f(); return null; } catch (e) { return (e as Error).message; }
};

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY: this suite needs a database.");
    process.exit(2);
  }
  const c = db();
  const created: string[] = [];

  try {
    console.log("ownership\n");
    const a = await ensureOwnedEntity(A, NAME, 2_500_000);
    const b = await ensureOwnedEntity(B, NAME, 2_500_000);
    created.push(a, b);
    check("two users importing the same name get two entities", a !== b);
    check("importing again finds the user's own entity", (await ensureOwnedEntity(A, NAME, 1)) === a);

    const demo = await findOperatorEntity(DEMO);
    if (demo) {
      const squatter = await ensureOwnedEntity(A, DEMO, 2_500_000);
      created.push(squatter);
      check("an import under the demo's name gets its own entity", squatter !== demo);
    } else {
      console.log(`  SKIP  no "${DEMO}" on this database: run \`npm run ingest -- --sample\` to test the demo`);
    }

    const bank = (ref: string) => ({
      rows: [{ external_id: ref, posted_date: "2026-01-05", description: "TENANCY TEST", amount: "-12.34", currency: "USD" }],
    });
    await ingestPeriod(a, "2026-01", { bank: bank("TA1") });
    await ingestPeriod(b, "2026-01", { bank: bank("TB1") });

    console.log("\nreading\n");
    const anon = await booksFor(null);
    check("a signed-out visitor sees no private books", !anon.some((x) => x.id === a || x.id === b));
    check("a signed-out visitor sees only public demos", anon.every((x) => x.demo && !x.member), `${anon.length} demo`);
    const seenByA = await booksFor(A);
    check("a user sees their own books, as a member", seenByA.some((x) => x.id === a && x.member));
    check("a user does not see another user's books", !seenByA.some((x) => x.id === b));
    check("a user's own books are listed before the demo", seenByA[0]?.id === a || seenByA[0]?.member === true);
    if (demo) check("a user sees the demo, read-only", seenByA.some((x) => x.id === demo && x.demo && !x.member));

    // B's books get one of everything the app can act on
    const { data: per } = await c.from("periods").select("id").eq("entity_id", b).eq("code", "2026-01").single();
    const { data: runRow } = await c.from("close_runs").insert({
      entity_id: b, period_id: per!.id, rulebook_version: 0, status: "succeeded",
    }).select("id").single();
    const { data: ex } = await c.from("exceptions").insert({
      entity_id: b, period_id: per!.id, close_run_id: runRow!.id, subject_type: "bank_line", subject_id: b,
      cause: "low_confidence", amount_cents: 1234, agent_proposal: { subjectRef: "TB1", subjectType: "bank_line" },
    }).select("id").single();
    const { data: rule } = await c.from("rules").insert({
      entity_id: b, kind: "coding", name: "tenancy test rule",
      predicate: [{ op: "vendor_is", value: "Tenancy Vendor" }], action: { type: "always_review", reason: "test" },
    }).select("id").single();
    const { data: entry } = await c.from("journal_entries").insert({
      entity_id: b, period_id: per!.id, close_run_id: runRow!.id, kind: "accrual", memo: "tenancy test accrual",
      lines: [{ debit_cents: 1000, credit_cents: 0 }, { debit_cents: 0, credit_cents: 1000 }],
      preparer: "agent", status: "pending_approval",
    }).select("id").single();

    console.log("\nwriting someone else's books\n");
    const scopeA = await memberEntityIds(A);
    const scopeB = await memberEntityIds(B);
    check("membership is exactly the user's own entities", scopeA.includes(a) && !scopeA.includes(b) && scopeB.includes(b) && !scopeB.includes(a));

    const queueA = await listQueue(scopeA);
    check("the queue shows nothing from another user's books", !(queueA?.items ?? []).some((i) => i.id === ex!.id));
    check("resolving another user's exception is refused",
      (await refuses(() => resolveException(ex!.id, { action: "accept" }, A, false, scopeA))) !== null);
    check("adopting another user's rule is refused", (await refuses(() => adoptRule(rule!.id, A, true, scopeA))) !== null);
    check("rejecting another user's rule is refused", (await refuses(() => adoptRule(rule!.id, A, false, scopeA))) !== null);
    check("approving another user's journal entry is refused",
      (await refuses(() => decideEntry(entry!.id, A, true, scopeA))) !== null);
    check("journal entries show nothing from another user's books", !(await listEntries(scopeA)).some((e) => e.id === entry!.id));
    const { data: after } = await c.from("exceptions").select("status").eq("id", ex!.id).single();
    const { data: ruleAfter } = await c.from("rules").select("status").eq("id", rule!.id).single();
    const { data: entryAfter } = await c.from("journal_entries").select("status").eq("id", entry!.id).single();
    check("and none of it changed", after?.status === "open" && ruleAfter?.status === "proposed" && entryAfter?.status === "pending_approval",
      `${after?.status} · ${ruleAfter?.status} · ${entryAfter?.status}`);
    check("an empty scope finds nothing", (await listQueue([])) === null && (await refuses(() => decideEntry(entry!.id, A, true, []))) !== null);

    console.log("\nwriting your own books\n");
    check("the owner sees their exception", ((await listQueue(scopeB))?.items ?? []).some((i) => i.id === ex!.id));
    check("the owner can resolve it", (await refuses(() => resolveException(ex!.id, { action: "accept" }, B, false, scopeB))) === null);
    check("the owner can reject their rule", (await refuses(() => adoptRule(rule!.id, B, false, scopeB))) === null);
    check("the owner can reject their entry", (await refuses(() => decideEntry(entry!.id, "Controller B", false, scopeB))) === null);
    check("a decided entry cannot be decided again",
      (await refuses(() => decideEntry(entry!.id, "Controller C", true, scopeB))) !== null);
    const { error: rewrite } = await c.from("journal_entries").update({ status: "posted", approver: "Controller C" }).eq("id", entry!.id);
    check("the database refuses to rewrite a decided entry", rewrite !== null, rewrite?.message.slice(0, 48) ?? "rewritten");

    console.log("\nclose allowance\n");
    process.env.TICKMARK_CLOSES_PER_DAY = "2";
    const claims = [await claimCloseSlot(A, a, "2026-01"), await claimCloseSlot(A, a, "2026-01"), await claimCloseSlot(A, a, "2026-01")];
    check("a person gets their allowance, then is refused", claims.join() === "true,true,false", claims.join(" "));
    const parallel = await Promise.all(Array.from({ length: 4 }, () => claimCloseSlot(B, b, "2026-01")));
    check("parallel requests cannot exceed it", parallel.filter(Boolean).length === 2, `${parallel.filter(Boolean).length} of 4 granted`);

    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (anonKey) {
      const pub = createClient(process.env.SUPABASE_URL, anonKey, { auth: { persistSession: false } });
      const { error: e1 } = await pub.rpc("create_owned_entity", { p_user: A, p_name: "forged", p_materiality_cents: 1 });
      const { error: e2 } = await pub.rpc("claim_close_slot", { p_user: A, p_entity: a, p_period: "2026-01", p_limit: 99 });
      check("the public key cannot create an entity in someone's name", e1 !== null, e1?.code ?? "allowed");
      check("the public key cannot claim someone's closes", e2 !== null, e2?.code ?? "allowed");
      const { data: leaked } = await pub.from("entities").select("id").limit(1);
      check("the public key reads no books", !leaked?.length);
    } else {
      console.log("  SKIP  set SUPABASE_ANON_KEY to check the public key cannot call the functions");
    }
  } finally {
    // nothing here wrote a tickmark, so the entities and everything under them can go
    if (created.length) {
      const { error } = await c.from("entities").delete().in("id", created);
      console.log(error ? `\n  cleanup failed: ${error.message}` : "\n  test entities removed");
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
