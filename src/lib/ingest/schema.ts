import { z } from "zod";

/**
 * The shapes a customer's books arrive in.
 *
 * Deliberately forgiving about headers and money formats, because real exports
 * from a bank, a bookkeeping system and an AP tool never agree - and strict about
 * what a row *means*, because a misread amount is an accounting error, not a
 * parsing inconvenience.
 */

/**
 * "1,234.56", "(1,234.56)", "-1234.56", "$1,234.56" -> integer cents.
 *
 * Parsed from the digits, never through a float: `Number("1234.57") * 100` is
 * 123456.99999999999, and money must not depend on how that rounds. An amount
 * with a non-zero third decimal place is refused rather than rounded, because a
 * fraction of a cent on a bank line means the column is not what we think it
 * is. Blank means zero; a lone symbol does not.
 */
export function parseMoneyCents(raw: string): number {
  const s = String(raw).trim();
  if (!s) return 0;
  const parenthesised = /^\(.*\)$/.test(s);
  let body = (parenthesised ? s.slice(1, -1) : s).replace(/[\s$,]/g, "");
  let negative = parenthesised;
  if (body.startsWith("-")) {
    if (parenthesised) throw new Error(`not an amount: "${raw}"`);
    negative = true;
    body = body.slice(1);
  } else if (body.startsWith("+")) {
    body = body.slice(1);
  }
  const m = /^(\d*)(?:\.(\d*))?$/.exec(body);
  if (!m || (m[1] === "" && !m[2])) throw new Error(`not an amount: "${raw}"`);
  // "12.3400" is an export padding to four places, not a fraction of a cent
  const fraction = (m[2] ?? "").replace(/^(\d{2})0+$/, "$1");
  if (fraction.length > 2) throw new Error(`more than two decimal places: "${raw}"`);
  const whole = m[1] === "" ? 0 : Number(m[1]);
  const cents = whole * 100 + Number(fraction.padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(cents)) throw new Error(`amount out of range: "${raw}"`);
  return negative && cents !== 0 ? -cents : cents;
}

const isoOf = (y: number, m: number, d: number): string | null => {
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return t.toISOString().slice(0, 10);
};

/**
 * Accepts ISO (2026-04-30), US (4/30/2026, 04.30.2026) and spelled-out
 * (30 Apr 2026, Apr 30, 2026) forms; always yields ISO. An impossible calendar
 * date such as 2026-02-31 is refused instead of rolling into March, and nothing
 * is read through the host's time zone.
 */
export function parseDate(raw: string): string {
  const s = String(raw).trim();
  const fail = () => new Error(`not a date: "${raw}"`);
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(s);
  if (iso) return isoOf(+iso[1], +iso[2], +iso[3]) ?? (() => { throw fail(); })();
  const us = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s);
  if (us) return isoOf(+us[3], +us[1], +us[2]) ?? (() => { throw fail(); })();
  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const month = (w: string) => MONTHS.indexOf(w.slice(0, 3).toLowerCase()) + 1;
  const dmy = /^(\d{1,2})[\s-]([A-Za-z]{3,9})\.?[\s-],?\s*(\d{4})$/.exec(s);
  if (dmy && month(dmy[2])) return isoOf(+dmy[3], month(dmy[2]), +dmy[1]) ?? (() => { throw fail(); })();
  const mdy = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (mdy && month(mdy[1])) return isoOf(+mdy[3], month(mdy[1]), +mdy[2]) ?? (() => { throw fail(); })();
  throw fail();
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
