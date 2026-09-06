import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BankRow, InvoiceRow, LedgerRow, parseCsv } from "./schema";

/**
 * Loading someone's books.
 *
 * This is the path the product actually depends on: the bundled sample company
 * is ingested through it exactly like a customer's export would be, so nothing
 * downstream is allowed to assume the fixture exists. A row that cannot be read
 * is reported with its reason rather than silently dropped - in accounting, a
 * missing line is a reconciling difference someone will chase for an hour.
 */

export const db = (): SupabaseClient =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

export interface Rejection { table: string; row: number; reason: string }
export interface IngestReport {
  entityId: string; periodId: string; periodCode: string;
  bankLines: number; ledgerEntries: number; apInvoices: number;
  rejected: Rejection[];
}

export async function ensureEntity(name: string, opts: { materialityCents?: number; ruleCeilingCents?: number } = {}) {
  const c = db();
  const { data } = await c.from("entities").select("id").eq("name", name).maybeSingle();
  if (data) return data.id as string;
  const { data: made, error } = await c.from("entities").insert({
    name,
    materiality_cents: opts.materialityCents ?? 2_500_000,
  }).select("id").single();
  if (error) throw new Error(`entity: ${error.message}`);
  return made!.id as string;
}

export async function ensureChart(
  entityId: string,
  accounts: { code: string; name: string; type: string; normal: string }[],
  departments: { code: string; name: string }[],
) {
  const c = db();
  if (accounts.length) {
    const { error } = await c.from("gl_accounts").upsert(
      accounts.map((a) => ({ entity_id: entityId, code: a.code, name: a.name, type: a.type, normal_balance: a.normal })),
      { onConflict: "entity_id,code" },
    );
    if (error) throw new Error(`chart of accounts: ${error.message}`);
  }
  if (departments.length) {
    const { error } = await c.from("departments").upsert(
      departments.map((d) => ({ entity_id: entityId, code: d.code, name: d.name })),
      { onConflict: "entity_id,code" },
    );
    if (error) throw new Error(`departments: ${error.message}`);
  }
}

export async function ensureVendors(
  entityId: string,
  vendors: { name: string; bankAliases?: string[]; recurring?: boolean; cadence?: string | null; terms?: number }[],
) {
  if (!vendors.length) return;
  const { error } = await db().from("vendors").upsert(
    vendors.map((v) => ({
      entity_id: entityId, name: v.name,
      bank_aliases: v.bankAliases ?? [],
      recurring: v.recurring ?? false,
      cadence: v.cadence ?? null,
      payment_terms: v.terms ?? 30,
    })),
    { onConflict: "entity_id,name" },
  );
  if (error) throw new Error(`vendors: ${error.message}`);
}

export async function ensurePeriod(entityId: string, code: string) {
  const c = db();
  const { data } = await c.from("periods").select("id").eq("entity_id", entityId).eq("code", code).maybeSingle();
  if (data) return data.id as string;
  const [y, m] = code.split("-").map(Number);
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const { data: made, error } = await c.from("periods").insert({
    entity_id: entityId, code,
    start_date: `${code}-01`, end_date: end,
    cutoff_date: new Date(Date.UTC(y, m, 5)).toISOString().slice(0, 10),
  }).select("id").single();
  if (error) throw new Error(`period: ${error.message}`);
  return made!.id as string;
}

/** A dynamic column list defeats the typed query parser, so select everything. */
const idMap = async (table: string, entityId: string, key: "code" | "name" = "code") => {
  const { data } = await db().from(table).select("*").eq("entity_id", entityId);
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return new Map(rows.map((r) => [String(r[key]), String(r.id)]));
};

export interface PeriodInput {
  bank?: { rows: unknown[] } | string;
  ledger?: { rows: unknown[] } | string;
  invoices?: { rows: unknown[] } | string;
}

const rowsOf = (v: PeriodInput["bank"]): unknown[] =>
  typeof v === "string" ? parseCsv(v) : (v?.rows ?? []);

export async function ingestPeriod(entityId: string, code: string, input: PeriodInput): Promise<IngestReport> {
  const c = db();
  const periodId = await ensurePeriod(entityId, code);
  const rejected: Rejection[] = [];

  const [accounts, depts, vendors] = await Promise.all([
    idMap("gl_accounts", entityId),
    idMap("departments", entityId),
    idMap("vendors", entityId, "name"),
  ]);

  // ── bank ──────────────────────────────────────────────────────────────────
  const bank = rowsOf(input.bank).flatMap((r, i) => {
    const parsed = BankRow.safeParse(r);
    if (!parsed.success) { rejected.push({ table: "bank_lines", row: i + 2, reason: parsed.error.issues[0].message }); return []; }
    const b = parsed.data;
    return [{
      entity_id: entityId, period_id: periodId, external_id: b.external_id,
      posted_date: b.posted_date, description: b.description,
      amount_cents: b.amount, currency: b.currency,
    }];
  });

  // ── ledger ────────────────────────────────────────────────────────────────
  const ledger = rowsOf(input.ledger).flatMap((r, i) => {
    const parsed = LedgerRow.safeParse(r);
    if (!parsed.success) { rejected.push({ table: "ledger_entries", row: i + 2, reason: parsed.error.issues[0].message }); return []; }
    const l = parsed.data;
    if (l.gl_code && !accounts.has(l.gl_code)) {
      rejected.push({ table: "ledger_entries", row: i + 2, reason: `unknown GL account "${l.gl_code}"` });
      return [];
    }
    return [{
      entity_id: entityId, period_id: periodId, external_id: l.external_id,
      entry_date: l.entry_date,
      gl_account_id: accounts.get(l.gl_code) ?? null,
      department_id: depts.get(l.dept_code) ?? null,
      vendor_id: vendors.get(l.vendor) ?? null,
      amount_cents: l.amount, memo: l.memo, source: l.source,
    }];
  });

  // ── invoices ──────────────────────────────────────────────────────────────
  const invoices = rowsOf(input.invoices).flatMap((r, i) => {
    const parsed = InvoiceRow.safeParse(r);
    if (!parsed.success) { rejected.push({ table: "ap_invoices", row: i + 2, reason: parsed.error.issues[0].message }); return []; }
    const v = parsed.data;
    const vendorId = vendors.get(v.vendor);
    if (!vendorId) { rejected.push({ table: "ap_invoices", row: i + 2, reason: `unknown vendor "${v.vendor}"` }); return []; }
    return [{
      entity_id: entityId, period_id: periodId, vendor_id: vendorId,
      invoice_number: v.invoice_number, invoice_date: v.invoice_date,
      due_date: v.due_date ?? v.invoice_date,
      amount_cents: v.amount, currency: v.currency, description: v.description,
      gl_account_id: accounts.get(v.gl_code) ?? null,
      department_id: depts.get(v.dept_code) ?? null,
      status: v.gl_code ? "coded" : "uncoded",
    }];
  });

  const chunk = <T,>(xs: T[], n = 500) =>
    Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

  for (const [table, rows, conflict] of [
    ["bank_lines", bank, "entity_id,external_id"],
    ["ledger_entries", ledger, "entity_id,external_id"],
    ["ap_invoices", invoices, "entity_id,vendor_id,invoice_number"],
  ] as const) {
    for (const part of chunk(rows as unknown[])) {
      if (!part.length) continue;
      const { error } = await c.from(table).upsert(part, { onConflict: conflict });
      if (error) throw new Error(`${table}: ${error.message}`);
    }
  }

  return {
    entityId, periodId, periodCode: code,
    bankLines: bank.length, ledgerEntries: ledger.length, apInvoices: invoices.length,
    rejected,
  };
}
