/**
 * Deterministic generation of a messy-but-realistic close.
 *
 * Every generated period carries its own ground truth, so accuracy is measured
 * against a known answer rather than asserted in a slide. The agent never sees
 * the `truth` block.
 */
import { BANK_NOISE, DEPARTMENTS, PERIODS, VENDORS, type VendorSpec } from "./fixture";

// ── deterministic PRNG (mulberry32) ───────────────────────────────────────────
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

// ── dates ─────────────────────────────────────────────────────────────────────
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const periodBounds = (code: string) => {
  const [y, m] = code.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  const cutoff = new Date(Date.UTC(y, m, 5)); // books close on the 5th
  return { start: ymd(start), end: ymd(end), cutoff: ymd(cutoff), y, m };
};
const dayIn = (code: string, day: number) => {
  const { y, m } = periodBounds(code);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return ymd(new Date(Date.UTC(y, m - 1, Math.min(Math.max(day, 1), last))));
};
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
};

// ── shapes ────────────────────────────────────────────────────────────────────
export interface GenBankLine {
  externalId: string; postedDate: string; description: string;
  amountCents: number; currency: string; fxRate?: number;
}
export interface GenLedgerEntry {
  externalId: string; entryDate: string; glCode: string | null; deptCode: string | null;
  vendorName: string | null; amountCents: number; memo: string;
  source: "ap" | "ar" | "payroll" | "manual" | "bank_fee";
}
export interface GenApInvoice {
  vendorName: string; invoiceNumber: string; invoiceDate: string; dueDate: string;
  amountCents: number; currency: string; description: string;
  lineItems: { label: string; amountCents: number }[];
}
/** Never shown to the agent. The answer key. */
export interface GroundTruth {
  coding: Record<string, { glCode: string; deptSplit: Record<string, number> }>;
  matches: { bankExternalIds: string[]; ledgerExternalIds: string[]; cardinality: string; deltaReason: string | null }[];
  expectedAccruals: { vendorName: string; amountCents: number; glCode: string }[];
}
export interface GeneratedPeriod {
  code: string; start: string; end: string; cutoff: string;
  bankLines: GenBankLine[]; ledgerEntries: GenLedgerEntry[]; apInvoices: GenApInvoice[];
  truth: GroundTruth;
}

const jittered = (base: number, jitter: number, r: () => number) =>
  Math.round(base * (1 + (r() * 2 - 1) * jitter));

const billsThisPeriod = (v: VendorSpec, idx: number) => {
  if (!v.recurring) return false;
  if (v.cadence === "monthly") return true;
  if (v.cadence === "quarterly") return idx % 3 === 1;   // Feb of the fixture window
  if (v.cadence === "annual") return idx === 1;          // Salesforce lands once
  return false;
};

/**
 * One recurring vendor is deliberately silent in the final period. Nothing is
 * wrong with the data - the invoice genuinely has not arrived yet. Accrual
 * completeness is exactly the job of noticing that.
 */
const SILENT = { periodIndex: 3, vendor: "Datadog" };

export function generatePeriod(code: string, idx: number): GeneratedPeriod {
  const r = rng(hash(code));
  const { start, end, cutoff } = periodBounds(code);

  const bankLines: GenBankLine[] = [];
  const ledgerEntries: GenLedgerEntry[] = [];
  const apInvoices: GenApInvoice[] = [];
  const truth: GroundTruth = { coding: {}, matches: [], expectedAccruals: [] };

  let seq = 0;
  const bid = () => `BNK-${code}-${String(++seq).padStart(4, "0")}`;
  let lseq = 0;
  const lid = () => `GL-${code}-${String(++lseq).padStart(4, "0")}`;

  const alias = (v: VendorSpec) => v.bankAliases[Math.floor(r() * v.bankAliases.length)];

  for (const v of VENDORS) {
    const silent = idx === SILENT.periodIndex && v.name === SILENT.vendor;
    if (silent) {
      truth.expectedAccruals.push({
        vendorName: v.name,
        amountCents: jittered(v.baseCents, v.jitter * 0.3, rng(hash(code + v.name))),
        glCode: v.glCode,
      });
      continue;
    }

    // ── vendors that never produce an invoice ────────────────────────────────
    if (v.quirk === "no_invoice") {
      for (const day of [15, 30]) {
        const amt = jittered(v.baseCents / 2, v.jitter, r);
        const b = bid();
        const d = dayIn(code, day);
        bankLines.push({ externalId: b, postedDate: d, description: alias(v), amountCents: -amt, currency: "USD" });
        const wages = Math.round(amt * 0.82);
        const l1 = lid(), l2 = lid();
        ledgerEntries.push(
          { externalId: l1, entryDate: d, glCode: "6010", deptCode: null, vendorName: v.name, amountCents: wages,        memo: v.descriptions[0], source: "payroll" },
          { externalId: l2, entryDate: d, glCode: "6020", deptCode: "GA", vendorName: v.name, amountCents: amt - wages, memo: "Employer taxes & benefits", source: "payroll" },
        );
        truth.matches.push({ bankExternalIds: [b], ledgerExternalIds: [l1, l2], cardinality: "1:many", deltaReason: null });
      }
      continue;
    }

    // ── payment processor: deposits arrive net of fees ───────────────────────
    if (v.quirk === "net_settlement") {
      for (const day of [7, 14, 21, 28]) {
        const gross = jittered(9_400_000, 0.3, r);
        const fee = Math.round(gross * 0.029) + 30;
        const net = gross - fee;
        const b = bid();
        const d = dayIn(code, day);
        bankLines.push({ externalId: b, postedDate: d, description: `${alias(v)}${Math.floor(r() * 1e8)}`, amountCents: net, currency: "USD" });
        const l1 = lid(), l2 = lid();
        ledgerEntries.push(
          // debit-positive convention: revenue is a credit, the fee is a debit
          { externalId: l1, entryDate: d, glCode: "4010", deptCode: "GTM", vendorName: null,   amountCents: -gross, memo: "Product revenue - card settlements", source: "ar" },
          { externalId: l2, entryDate: d, glCode: "6410", deptCode: "GTM", vendorName: v.name, amountCents: fee,    memo: "Stripe processing fees", source: "bank_fee" },
        );
        truth.matches.push({ bankExternalIds: [b], ledgerExternalIds: [l1, l2], cardinality: "1:many", deltaReason: "bank_fee" });
      }
      continue;
    }

    // ── ordinary invoiced vendors ───────────────────────────────────────────
    const count = v.recurring ? (billsThisPeriod(v, idx) ? 1 : 0) : 2 + Math.floor(r() * 4);
    for (let i = 0; i < count; i++) {
      const amtNative = jittered(v.baseCents, v.jitter, r);
      const invDate = dayIn(code, 2 + Math.floor(r() * 22));
      const num = `${v.name.slice(0, 3).toUpperCase()}-${code.replace("-", "")}-${1000 + Math.floor(r() * 8999)}`;

      apInvoices.push({
        vendorName: v.name, invoiceNumber: num, invoiceDate: invDate,
        dueDate: addDays(invDate, v.terms), amountCents: amtNative,
        currency: v.currency ?? "USD",
        description: v.descriptions[Math.floor(r() * v.descriptions.length)],
        lineItems: [{ label: v.descriptions[0], amountCents: amtNative }],
      });
      truth.coding[num] = { glCode: v.glCode, deptSplit: v.deptSplit };

      // the GL side of the invoice, split across departments per ground truth
      const usd = v.currency === "EUR" ? Math.round(amtNative * 1.084) : amtNative;
      const ledgerIds: string[] = [];
      for (const [dept, w] of Object.entries(v.deptSplit)) {
        const id = lid();
        ledgerIds.push(id);
        ledgerEntries.push({
          externalId: id, entryDate: invDate, glCode: v.glCode, deptCode: dept,
          vendorName: v.name, amountCents: Math.round(usd * w),
          memo: `${v.name} ${num}`, source: "ap",
        });
      }

      // ── settlement ────────────────────────────────────────────────────────
      const payDate = dayIn(code, Math.min(28, new Date(invDate + "T00:00:00Z").getUTCDate() + Math.min(v.terms, 20)));

      if (v.quirk === "installments" && amtNative > 5_000_000) {
        const first = Math.round(usd * 0.6);
        const b1 = bid(), b2 = bid();
        bankLines.push(
          { externalId: b1, postedDate: payDate,             description: `${alias(v)} TRANCHE 1/2`, amountCents: -first,       currency: "USD" },
          { externalId: b2, postedDate: addDays(payDate, 6), description: `${alias(v)} TRANCHE 2/2`, amountCents: -(usd - first), currency: "USD" },
        );
        truth.matches.push({ bankExternalIds: [b1, b2], ledgerExternalIds: ledgerIds, cardinality: "many:1", deltaReason: "partial" });
      } else if (v.quirk === "fx") {
        // billed EUR, settled USD at a rate that is never the accrual rate
        const settled = Math.round(amtNative * (1.084 + (r() * 2 - 1) * 0.012));
        const b = bid();
        bankLines.push({ externalId: b, postedDate: payDate, description: `${alias(v)} EUR${(amtNative / 100).toFixed(2)}`, amountCents: -settled, currency: "USD", fxRate: settled / amtNative });
        truth.matches.push({ bankExternalIds: [b], ledgerExternalIds: ledgerIds, cardinality: "1:many", deltaReason: "fx" });
      } else if (v.quirk === "annual_prepaid") {
        const b = bid();
        bankLines.push({ externalId: b, postedDate: payDate, description: alias(v), amountCents: -usd, currency: "USD" });
        truth.matches.push({ bankExternalIds: [b], ledgerExternalIds: ledgerIds, cardinality: "1:many", deltaReason: null });
      } else {
        const b = bid();
        bankLines.push({ externalId: b, postedDate: payDate, description: alias(v), amountCents: -usd, currency: "USD" });
        truth.matches.push({
          bankExternalIds: [b], ledgerExternalIds: ledgerIds,
          cardinality: ledgerIds.length > 1 ? "1:many" : "1:1", deltaReason: null,
        });
      }
    }
  }

  // ── statement noise with a GL counterpart ──────────────────────────────────
  for (const n of [...BANK_NOISE, ...BANK_NOISE, ...BANK_NOISE]) {
    if (r() > 0.8) continue;
    const d = dayIn(code, 3 + Math.floor(r() * 25));
    const b = bid(), l = lid();
    const cents = jittered(n.cents, 0.25, r);
    bankLines.push({ externalId: b, postedDate: d, description: n.desc, amountCents: cents, currency: "USD" });
    ledgerEntries.push({ externalId: l, entryDate: d, glCode: n.gl, deptCode: n.dept, vendorName: null, amountCents: -cents, memo: n.desc, source: "bank_fee" });
    truth.matches.push({ bankExternalIds: [b], ledgerExternalIds: [l], cardinality: "1:1", deltaReason: null });
  }

  // ── genuine timing differences: on the bank, not yet in the GL ─────────────
  for (let i = 0; i < 2; i++) {
    const d = dayIn(code, 27 + i);
    bankLines.push({
      externalId: bid(), postedDate: d,
      description: i === 0 ? "DEPOSIT IN TRANSIT - LOCKBOX" : "ACH DEBIT PENDING VENDOR REF 88213",
      amountCents: i === 0 ? jittered(1_240_000, 0.4, r) : -jittered(318_000, 0.4, r),
      currency: "USD",
    });
  }

  bankLines.sort((a, b) => a.postedDate.localeCompare(b.postedDate));
  return { code, start, end, cutoff, bankLines, ledgerEntries, apInvoices, truth };
}

export function generateAll(): GeneratedPeriod[] {
  return PERIODS.map((code, i) => generatePeriod(code, i));
}

export const DEPT_CODES = DEPARTMENTS.map((d) => d.code);
