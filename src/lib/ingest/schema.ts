import { z } from "zod";

/**
 * The shapes a customer's books arrive in.
 *
 * Deliberately forgiving about headers and money formats, because real exports
 * from a bank, a bookkeeping system and an AP tool never agree - and strict about
 * what a row *means*, because a misread amount is an accounting error, not a
 * parsing inconvenience.
 */

/** "1,234.56", "(1,234.56)", "-1234.56", "$1,234.56" -> integer cents. */
export function parseMoneyCents(raw: string): number {
  const s = String(raw).trim();
  if (!s) return 0;
  const negative = /^\(.*\)$/.test(s) || s.startsWith("-");
  const digits = s.replace(/[()$,\s]/g, "").replace(/^-/, "");
  if (!/^\d*(\.\d+)?$/.test(digits)) throw new Error(`not an amount: "${raw}"`);
  const cents = Math.round(Number(digits || "0") * 100);
  return negative ? -cents : cents;
}

/** Accepts ISO, US and dotted forms; always yields ISO. */
export function parseDate(raw: string): string {
  const s = String(raw).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return s;
  const us = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`not a date: "${raw}"`);
  return d.toISOString().slice(0, 10);
}

const money = z.string().transform((v, ctx) => {
  try { return parseMoneyCents(v); }
  catch (e) { ctx.addIssue({ code: "custom", message: (e as Error).message }); return z.NEVER; }
});
const date = z.string().transform((v, ctx) => {
  try { return parseDate(v); }
  catch (e) { ctx.addIssue({ code: "custom", message: (e as Error).message }); return z.NEVER; }
});

export const BankRow = z.object({
  external_id: z.string().min(1),
  posted_date: date,
  description: z.string().min(1),
  amount: money,
  currency: z.string().default("USD"),
});

export const LedgerRow = z.object({
  external_id: z.string().min(1),
  entry_date: date,
  gl_code: z.string().optional().default(""),
  dept_code: z.string().optional().default(""),
  vendor: z.string().optional().default(""),
  amount: money,
  memo: z.string().optional().default(""),
  source: z.enum(["ap", "ar", "payroll", "manual", "bank_fee"]).default("manual"),
});

export const InvoiceRow = z.object({
  vendor: z.string().min(1),
  invoice_number: z.string().min(1),
  invoice_date: date,
  due_date: date.optional(),
  amount: money,
  currency: z.string().default("USD"),
  description: z.string().optional().default(""),
  gl_code: z.string().optional().default(""),
  dept_code: z.string().optional().default(""),
});

export type BankRowIn = z.input<typeof BankRow>;
export type LedgerRowIn = z.input<typeof LedgerRow>;
export type InvoiceRowIn = z.input<typeof InvoiceRow>;

/** Set on a row whose field count disagrees with the header. */
export const MALFORMED = "__malformed";

/** Minimal RFC4180 reader: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  if (!rows.length) return [];

  // headers are normalised so "Posted Date", "posted_date" and "POSTED-DATE" agree
  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));

  return rows.slice(1).map((r) => {
    const out: Record<string, string> = Object.fromEntries(
      headers.map((h, i) => [h, (r[i] ?? "").trim()]),
    );
    /*
     * A row with the wrong number of fields is not a row we may guess at. The
     * usual cause is an unquoted thousands separator - "$1,240.00" written
     * without quotes splits into "$1" and "240.00", and reading that as one
     * dollar is an accounting error, not a parsing inconvenience. Flag it and
     * let the caller reject it with a reason.
     */
    if (r.length !== headers.length) {
      out[MALFORMED] = `expected ${headers.length} columns, found ${r.length}` +
        (r.length > headers.length ? " — an unquoted comma inside a value, perhaps a thousands separator?" : "");
    }
    return out;
  });
}
