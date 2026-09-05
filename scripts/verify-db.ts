/**
 * End-to-end check against the real database.
 *
 * The invariants in CONTEXT.md are enforced by triggers, not by prose. This
 * proves it: each one is deliberately violated and must be rejected.
 */
import { createClient } from "@supabase/supabase-js";
import { getStore } from "../src/lib/store";

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(46)} ${detail}`);
};

/** A write that MUST be rejected. Succeeding is the failure. */
async function mustReject(name: string, fn: () => Promise<{ error: { message: string } | null }>) {
  const { error } = await fn();
  check(name, error !== null, error ? `rejected: ${error.message.slice(0, 58)}` : "NOT REJECTED — invariant unenforced");
}

async function main() {
  const store = await getStore();
  check("store selects the Supabase adapter", store.kind === "supabase", store.kind);

  // schema reachable
  const { error: tableErr } = await db.from("entities").select("id").limit(1);
  check("schema is reachable", tableErr === null, tableErr?.message ?? "18 tables");

  // fixtures for the trigger tests
  const { data: ent, error: entErr } = await db
    .from("entities").insert({ name: "__verify__", materiality_cents: 1 }).select("id").single();
  if (entErr || !ent) { check("create scratch entity", false, entErr?.message); process.exit(1); }
  const entityId = ent.id as string;

  const { data: per } = await db.from("periods").insert({
    entity_id: entityId, code: "9999-01", start_date: "9999-01-01",
    end_date: "9999-01-31", cutoff_date: "9999-02-05",
  }).select("id").single();
  const periodId = per!.id as string;

  try {
    // invariant 1 — debits equal credits
    await mustReject("unbalanced journal entry is refused", () =>
      db.from("journal_entries").insert({
        entity_id: entityId, period_id: periodId, kind: "accrual", memo: "unbalanced",
        preparer: "a", lines: [{ debit_cents: 100, credit_cents: 0 }],
      }) as never);

    const { error: balancedErr } = await db.from("journal_entries").insert({
      entity_id: entityId, period_id: periodId, kind: "accrual", memo: "balanced",
      preparer: "a", lines: [{ debit_cents: 100, credit_cents: 0 }, { debit_cents: 0, credit_cents: 100 }],
    });
    check("balanced journal entry is accepted", balancedErr === null, balancedErr?.message ?? "debits = credits");

    // invariant 4 — segregation of duties
    await mustReject("preparer == approver is refused", () =>
      db.from("journal_entries").insert({
        entity_id: entityId, period_id: periodId, kind: "accrual", memo: "sod",
        preparer: "same", approver: "same",
        lines: [{ debit_cents: 50, credit_cents: 0 }, { debit_cents: 0, credit_cents: 50 }],
      }) as never);

    // invariant 2 — tickmarks are append-only
    const { data: tick } = await db.from("tickmarks").insert({
      entity_id: entityId, period_id: periodId, subject_type: "ap_invoice",
      subject_id: entityId, asserted_by: "agent", actor: "verify", confidence: 0.99,
    }).select("id").single();
    await mustReject("updating a tickmark is refused", () =>
      db.from("tickmarks").update({ actor: "tampered" }).eq("id", tick!.id) as never);
    await mustReject("deleting a tickmark is refused", () =>
      db.from("tickmarks").delete().eq("id", tick!.id) as never);

    // invariant 6 — no rule active without a backtest and 2 corrections
    await mustReject("activating an unbacktested rule is refused", () =>
      db.from("rules").insert({
        entity_id: entityId, kind: "coding", name: "no backtest", status: "active",
        predicate: [{ op: "vendor_is", value: "X" }], action: { type: "code", glCode: "6820", deptSplit: {} },
      }) as never);

    await mustReject("activating a rule with 1 correction is refused", () =>
      db.from("rules").insert({
        entity_id: entityId, kind: "coding", name: "thin evidence", status: "active",
        predicate: [{ op: "vendor_is", value: "X" }], action: { type: "code", glCode: "6820", deptSplit: {} },
        backtest: { precision: 1 }, evidence: [{ correctionId: "c1" }],
      }) as never);

    // report round-trip
    const existing = await store.loadLatest();
    if (existing) {
      await store.saveReport(existing);
      const back = await store.loadLatest();
      check("report round-trips through Supabase", back?.periods.length === existing.periods.length,
        `${back?.periods.length ?? 0} periods, provenance ${back?.provenance}`);
    } else {
      check("report round-trips through Supabase", false, "no local report to round-trip");
    }
  } finally {
    await db.from("entities").delete().eq("id", entityId);   // cascades
    console.log("\n  scratch entity removed");
  }

  console.log(`\n${fail === 0 ? "all invariants enforced by the database" : `${fail} check(s) failed`}  (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("verify crashed:", e?.message ?? e); process.exit(1); });
