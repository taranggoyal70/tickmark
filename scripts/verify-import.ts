/**
 * Import, tested against the kind of file a finance team actually sends.
 *
 * Not a clean fixture: mixed header casing, US dates, dollar signs, thousands
 * separators, parenthesised negatives, a blank line, and two rows that are
 * genuinely unreadable. The unreadable ones must be reported, not dropped.
 */
import { ensureChart, ensureEntity, ensureVendors, ingestPeriod } from "../src/lib/ingest/ingest";
import { db } from "../src/lib/ingest/ingest";
import { parseMoneyCents, parseDate } from "../src/lib/ingest/schema";
import { STARTER_CHART, STARTER_DEPARTMENTS } from "../src/lib/ingest/starter-chart";

const ENTITY = "Import Test Co.";
const PERIOD = "2027-01";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(52)} ${detail}`);
};

const BANK = `External ID,Posted Date,DESCRIPTION,Amount
BNK-1,01/15/2027,"ACME PAYMENTS, INC.",$1,240.00
BNK-2,2027-01-16,STRIPE PAYOUT ST-8891,"(2,310.55)"
BNK-3,1/17/2027,MONTHLY MAINTENANCE FEE,-35.00

BNK-4,2027-01-18,WIRE OUT — SUPPLIER,not-a-number
BNK-5,tuesday,SOME LINE,100.00
`;

const INVOICES = `vendor,invoice_number,invoice_date,amount,description
Acme Payments,INV-9001,01/10/2027,"$1,240.00",Card processing
Northwind Supply,INV-9002,2027-01-12,"3,410.00",Components
`;

async function main() {
  if (!process.env.SUPABASE_URL) { console.error("needs SUPABASE_URL"); process.exit(2); }

  check("money: $1,240.00", parseMoneyCents("$1,240.00") === 124000, String(parseMoneyCents("$1,240.00")));
  check("money: (2,310.55) is negative", parseMoneyCents("(2,310.55)") === -231055, String(parseMoneyCents("(2,310.55)")));
  check("date: 01/15/2027 -> ISO", parseDate("01/15/2027") === "2027-01-15", parseDate("01/15/2027"));

  const entityId = await ensureEntity(ENTITY);
  await ensureChart(entityId, STARTER_CHART.map((a) => ({ ...a })), STARTER_DEPARTMENTS.map((d) => ({ ...d })));
  await ensureVendors(entityId, [{ name: "Acme Payments" }, { name: "Northwind Supply" }]);

  const r = await ingestPeriod(entityId, PERIOD, { bank: BANK, invoices: INVOICES });

  check("readable bank rows imported", r.bankLines === 2, `${r.bankLines} of 5`);
  check("unreadable rows rejected, not dropped", r.rejected.length === 3, `${r.rejected.length} rejected`);
  check("a rejection names its row and reason", Boolean(r.rejected[0]?.row && r.rejected[0]?.reason),
    r.rejected.map((x) => `row ${x.row}: ${x.reason}`).join(" · ").slice(0, 60));
  check("blank lines are ignored, not rejected", !r.rejected.some((x) => /row 5/.test(String(x.row)) && x.reason.includes("undefined")));
  check("invoices imported", r.apInvoices === 2, `${r.apInvoices} of 2`);

  const { data: lines } = await db().from("bank_lines").select("external_id, amount_cents, posted_date")
    .eq("entity_id", entityId).order("external_id");
  const two = lines?.find((l) => l.external_id === "BNK-2");
  const three = lines?.find((l) => l.external_id === "BNK-3");
  check("an unquoted thousands separator is refused, not misread",
    !lines?.some((l) => l.external_id === "BNK-1") && r.rejected.some((x) => /unquoted comma/.test(x.reason)),
    "reading \$1,240.00 as \$1.00 would be an accounting error");
  check("parenthesised amount stored negative", two?.amount_cents === -231055, String(two?.amount_cents));
  check("US date normalised on the way in", three?.posted_date === "2027-01-17", String(three?.posted_date));

  // leave nothing behind
  await db().from("bank_lines").delete().eq("entity_id", entityId);
  await db().from("ap_invoices").delete().eq("entity_id", entityId);
  await db().from("periods").delete().eq("entity_id", entityId);
  await db().from("vendors").delete().eq("entity_id", entityId);
  await db().from("gl_accounts").delete().eq("entity_id", entityId);
  await db().from("departments").delete().eq("entity_id", entityId);
  await db().from("entities").delete().eq("id", entityId);
  console.log("\n  test entity removed");

  console.log(`\n${fail === 0 ? "a real export survives the door" : `${fail} check(s) failed`}  (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("verify-import crashed:", e?.message ?? e); process.exit(1); });
