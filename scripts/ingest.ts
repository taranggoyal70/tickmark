/**
 * Load books into Tickmark.
 *
 *   npm run ingest -- --sample                       load the bundled sample company
 *   npm run ingest -- --sample --emit sample-books   also write the CSVs it used
 *   npm run ingest -- --entity "Acme, Inc." --period 2026-05 \
 *                     --bank bank.csv --ledger gl.csv --invoices ap.csv
 *
 * The sample company is loaded through exactly the same path as a customer's
 * export. Nothing downstream is permitted to know which it got.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEPARTMENTS, ENTITY, GL_ACCOUNTS, VENDORS } from "../src/lib/seed/fixture";
import { generateAll } from "../src/lib/seed/generate";
import { ensureChart, ensureEntity, ensureVendors, ingestPeriod, type IngestReport } from "../src/lib/ingest/ingest";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const flag = (name: string) => process.argv.includes(`--${name}`);

const csv = (rows: Record<string, string | number>[]) => {
  if (!rows.length) return "";
  const head = Object.keys(rows[0]);
  const cell = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [head.join(","), ...rows.map((r) => head.map((h) => cell(r[h] ?? "")).join(","))].join("\n");
};
const money = (cents: number) => (cents / 100).toFixed(2);

function report(r: IngestReport) {
  console.log(`  ${r.periodCode}  bank ${String(r.bankLines).padStart(3)} · ledger ${String(r.ledgerEntries).padStart(3)} · invoices ${String(r.apInvoices).padStart(3)}`);
  for (const x of r.rejected.slice(0, 8)) console.log(`      rejected ${x.table} row ${x.row}: ${x.reason}`);
  if (r.rejected.length > 8) console.log(`      …and ${r.rejected.length - 8} more rejected rows`);
}

async function sample() {
  const emitDir = arg("emit");
  const entityId = await ensureEntity(ENTITY.name, { materialityCents: ENTITY.materialityCents });
  await ensureChart(
    entityId,
    GL_ACCOUNTS.map((a) => ({ code: a.code, name: a.name, type: a.type, normal: a.normal })),
    DEPARTMENTS.map((d) => ({ code: d.code, name: d.name })),
  );
  await ensureVendors(entityId, VENDORS.map((v) => ({
    name: v.name, bankAliases: v.bankAliases, recurring: v.recurring, cadence: v.cadence ?? null, terms: v.terms,
  })));
  console.log(`entity ${ENTITY.name}\n  chart ${GL_ACCOUNTS.length} accounts · ${DEPARTMENTS.length} departments · ${VENDORS.length} vendors\n`);

  const periods = generateAll();
  for (const [idx, p] of periods.entries()) {
    // A real company's earlier months are closed and coded; only the open one is
    // uncoded. Emitting every period uncoded would leave the agent with no
    // precedent to learn from, which is not what anyone's books look like.
    const closed = idx < periods.length - 1;
    const bank = p.bankLines.map((b) => ({
      external_id: b.externalId, posted_date: b.postedDate, description: b.description,
      amount: money(b.amountCents), currency: b.currency,
    }));
    const ledger = p.ledgerEntries.map((e) => ({
      external_id: e.externalId, entry_date: e.entryDate, gl_code: e.glCode ?? "",
      dept_code: e.deptCode ?? "", vendor: e.vendorName ?? "", amount: money(e.amountCents),
      memo: e.memo, source: e.source,
    }));
    const invoices = p.apInvoices.map((i) => {
      const truth = closed ? p.truth.coding[i.invoiceNumber] : undefined;
      const dominant = truth
        ? Object.entries(truth.deptSplit).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ""
        : "";
      return {
        vendor: i.vendorName, invoice_number: i.invoiceNumber, invoice_date: i.invoiceDate,
        due_date: i.dueDate, amount: money(i.amountCents), currency: i.currency, description: i.description,
        gl_code: truth?.glCode ?? "", dept_code: dominant,
      };
    });

    if (emitDir) {
      const dir = path.join(process.cwd(), emitDir, p.code);
      await mkdir(dir, { recursive: true });
      await Promise.all([
        writeFile(path.join(dir, "bank.csv"), csv(bank), "utf8"),
        writeFile(path.join(dir, "ledger.csv"), csv(ledger), "utf8"),
        writeFile(path.join(dir, "invoices.csv"), csv(invoices), "utf8"),
      ]);
    }

    // through the customer path, from CSV text, not from the objects above
    report(await ingestPeriod(entityId, p.code, {
      bank: csv(bank), ledger: csv(ledger), invoices: csv(invoices),
    }));
  }
  if (emitDir) console.log(`\nwrote sample CSVs to ${emitDir}/`);
}

async function customer() {
  const name = arg("entity"), period = arg("period");
  if (!name || !period) {
    console.error("need --entity <name> --period <YYYY-MM>, plus at least one of --bank/--ledger/--invoices");
    process.exit(2);
  }
  const entityId = await ensureEntity(name);
  const read = async (f?: string) => (f ? readFile(path.resolve(f), "utf8") : undefined);
  const [bank, ledger, invoices] = await Promise.all([read(arg("bank")), read(arg("ledger")), read(arg("invoices"))]);

  console.log(`entity ${name}`);
  const r = await ingestPeriod(entityId, period, { bank, ledger, invoices });
  report(r);
  if (r.rejected.length) process.exit(1);
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("ingestion writes to the database: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(2);
  }
  await (flag("sample") ? sample() : customer());
}

main().catch((e) => { console.error("ingest failed:", e?.message ?? e); process.exit(1); });
