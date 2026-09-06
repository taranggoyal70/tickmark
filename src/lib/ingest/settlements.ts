import { parseCsv, parseDate, parseMoneyCents, MALFORMED } from "./schema";

/**
 * Payment processor settlements.
 *
 * A processor pays out net of its fees, so the deposit on the bank never equals
 * the revenue behind it. Reconciling that by hand is one of the most repetitive
 * jobs in a close: gross, less fee, equals the payout that actually landed.
 *
 * This reads a payout breakup export - Dodo Payments, Stripe, or any processor
 * that exports gross/fee/net - and expands each settlement into the three rows
 * a close needs: the bank deposit at net, revenue at gross, and the fee as an
 * expense. Column names are matched by alias because no two processors agree.
 *
 * Dodo Payments exposes exactly this file at
 * `GET /payouts/{id}/breakup/csv` (docs: api-reference/payouts/download-breakup-csv),
 * base https://live.dodopayments.com with `Authorization: Bearer <key>`.
 * Download it and hand it to `npm run ingest -- --settlements <file>`; nothing
 * here depends on a response shape this repo has not seen.
 */

const ALIASES: Record<string, string[]> = {
  id: ["transaction_id", "payment_id", "id", "reference", "payout_id", "charge_id"],
  date: ["settlement_date", "payout_date", "created_at", "date", "posted_date", "available_on"],
  gross: ["gross", "gross_amount", "amount", "total", "amount_gross"],
  fee: ["fee", "fees", "processing_fee", "commission", "amount_fee", "platform_fee"],
  net: ["net", "net_amount", "payout_amount", "settled_amount", "amount_net"],
  currency: ["currency", "curr", "settlement_currency"],
  description: ["description", "narrative", "product", "memo", "customer"],
};

const pick = (row: Record<string, string>, key: string) => {
  for (const a of ALIASES[key]) {
    const v = row[a];
    if (v !== undefined && v !== "") return v;
  }
  return "";
};

export interface SettlementRows {
  bank: Record<string, string>[];
  ledger: Record<string, string>[];
  rejected: { table: string; row: number; reason: string }[];
  /** what the reader decided each column meant, so a wrong guess is visible */
  mapping: Record<string, string>;
}

export interface SettlementOptions {
  /** GL account revenue is credited to. */
  revenueCode?: string;
  /** GL account processor fees are charged to. */
  feeCode?: string;
  processor?: string;
}

const money = (cents: number) => (cents / 100).toFixed(2);

export function readSettlements(csv: string, opts: SettlementOptions = {}): SettlementRows {
  const revenueCode = opts.revenueCode ?? "4010";
  const feeCode = opts.feeCode ?? "6410";
  const processor = opts.processor ?? "Processor";

  const rows = parseCsv(csv);
  const bank: Record<string, string>[] = [];
  const ledger: Record<string, string>[] = [];
  const rejected: SettlementRows["rejected"] = [];
  const mapping: Record<string, string> = {};

  if (rows.length) {
    for (const key of Object.keys(ALIASES)) {
      const found = ALIASES[key].find((a) => a in rows[0]);
      if (found) mapping[key] = found;
    }
  }

  rows.forEach((r, i) => {
    const line = i + 2;
    if (r[MALFORMED]) { rejected.push({ table: "settlements", row: line, reason: r[MALFORMED] }); return; }

    const id = pick(r, "id") || `SETL-${line}`;
    const rawDate = pick(r, "date");
    if (!rawDate) { rejected.push({ table: "settlements", row: line, reason: "no settlement date column found" }); return; }

    let date: string, gross: number, fee: number, net: number;
    try {
      date = parseDate(rawDate);
      const g = pick(r, "gross"), f = pick(r, "fee"), n = pick(r, "net");
      gross = g ? Math.abs(parseMoneyCents(g)) : 0;
      fee = f ? Math.abs(parseMoneyCents(f)) : 0;
      net = n ? Math.abs(parseMoneyCents(n)) : gross - fee;
      if (!gross && net) gross = net + fee;
    } catch (e) {
      rejected.push({ table: "settlements", row: line, reason: (e as Error).message });
      return;
    }

    // The arithmetic has to hold or the settlement is not understood, and a
    // deposit that does not equal gross less fee is not something to post.
    if (gross - fee !== net) {
      rejected.push({
        table: "settlements", row: line,
        reason: `gross ${money(gross)} less fee ${money(fee)} is ${money(gross - fee)}, but net is ${money(net)}`,
      });
      return;
    }
    if (!net) { rejected.push({ table: "settlements", row: line, reason: "settlement is zero" }); return; }

    const currency = pick(r, "currency") || "USD";
    const label = pick(r, "description") || `${processor} settlement`;

    bank.push({
      external_id: `${processor}-${id}`.slice(0, 60),
      posted_date: date,
      description: `${processor.toUpperCase()} PAYOUT ${id}`,
      amount: money(net),
      currency,
    });
    // debit-positive: revenue is a credit, the fee is a debit
    ledger.push({
      external_id: `${processor}-${id}-REV`, entry_date: date, gl_code: revenueCode,
      dept_code: "", vendor: "", amount: money(-gross), memo: label, source: "ar",
    });
    if (fee) {
      ledger.push({
        external_id: `${processor}-${id}-FEE`, entry_date: date, gl_code: feeCode,
        dept_code: "", vendor: processor, amount: money(fee),
        memo: `${processor} processing fee`, source: "bank_fee",
      });
    }
  });

  return { bank, ledger, rejected, mapping };
}
