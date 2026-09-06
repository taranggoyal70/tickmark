import { db } from "../ingest/ingest";

/**
 * Cash reporting and the forward view.
 *
 * A treasury forecast is only worth reading if you can see where each number
 * came from, so every projected line carries its basis and the count of periods
 * behind it. A vendor seen once is not a pattern and is reported as such rather
 * than quietly averaged into the total.
 */

export interface PeriodCash {
  periodCode: string;
  inflowCents: number;
  outflowCents: number;
  netCents: number;
  closingPositionCents: number;
}

export interface ForecastLine {
  label: string;
  amountCents: number;
  basis: string;
  /** how many prior periods support it; 1 is an anecdote, not a pattern */
  observations: number;
  certain: boolean;
}

export interface CashView {
  entity: string;
  actuals: PeriodCash[];
  forecastPeriod: string;
  expectedOutflows: ForecastLine[];
  expectedInflows: ForecastLine[];
  projectedNetCents: number;
  committedOutflowCents: number;
  /** projected lines resting on a single observation */
  thinEvidenceCount: number;
}

const nextPeriod = (code: string) => {
  const [y, m] = code.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

export async function cashView(entityName: string): Promise<CashView | null> {
  const c = db();
  const { data: ent } = await c.from("entities").select("id, name").eq("name", entityName).maybeSingle();
  if (!ent) return null;

  const [{ data: pers }, { data: bank }, { data: inv }] = await Promise.all([
    c.from("periods").select("id, code").eq("entity_id", ent.id).order("code"),
    c.from("bank_lines").select("period_id, amount_cents").eq("entity_id", ent.id),
    c.from("ap_invoices").select("vendor_id, amount_cents, due_date, status, period_id, vendors(name), periods(code)").eq("entity_id", ent.id),
  ]);
  if (!pers?.length) return null;

  const codeOf = new Map((pers).map((p) => [String(p.id), String(p.code)]));

  // ── actuals ───────────────────────────────────────────────────────────────
  const byPeriod = new Map<string, { in: number; out: number }>();
  for (const p of pers) byPeriod.set(String(p.code), { in: 0, out: 0 });
  for (const b of (bank ?? []) as unknown as Record<string, unknown>[]) {
    const code = codeOf.get(String(b.period_id));
    if (!code) continue;
    const amt = Number(b.amount_cents);
    const e = byPeriod.get(code)!;
    if (amt >= 0) e.in += amt; else e.out += amt;
  }

  let running = 0;
  const actuals: PeriodCash[] = [...byPeriod.entries()].map(([periodCode, v]) => {
    const net = v.in + v.out;
    running += net;
    return { periodCode, inflowCents: v.in, outflowCents: v.out, netCents: net, closingPositionCents: running };
  });

  // ── the forward view ──────────────────────────────────────────────────────
  const last = actuals[actuals.length - 1].periodCode;
  const forecastPeriod = nextPeriod(last);

  const invoices = (inv ?? []) as unknown as Record<string, unknown>[];
  const spendByVendor = new Map<string, number[]>();
  for (const i of invoices) {
    const vendor = (i.vendors as { name?: string } | null)?.name;
    if (!vendor) continue;
    (spendByVendor.get(vendor) ?? spendByVendor.set(vendor, []).get(vendor)!).push(Number(i.amount_cents));
  }

  const expectedOutflows: ForecastLine[] = [...spendByVendor.entries()]
    .map(([vendor, amounts]) => ({
      label: vendor,
      amountCents: -avg(amounts.slice(-3)),
      basis: amounts.length >= 2
        ? `average of the last ${Math.min(3, amounts.length)} invoices`
        : "a single invoice — not yet a pattern",
      observations: amounts.length,
      certain: false,
    }))
    .filter((l) => l.amountCents !== 0)
    .sort((a, b) => a.amountCents - b.amountCents);

  // invoices already received and not yet paid are commitments, not estimates
  const committed = invoices.filter((i) => String(i.status) !== "paid");
  const committedOutflowCents = -committed.reduce((s, i) => s + Number(i.amount_cents), 0);
  if (committed.length) {
    expectedOutflows.unshift({
      label: `${committed.length} invoices already received, unpaid`,
      amountCents: committedOutflowCents,
      basis: "invoiced and outstanding — a commitment, not a projection",
      observations: committed.length,
      certain: true,
    });
  }

  const inflowHistory = actuals.map((a) => a.inflowCents).filter((x) => x > 0);
  const expectedInflows: ForecastLine[] = inflowHistory.length
    ? [{
        label: "Receipts",
        amountCents: avg(inflowHistory.slice(-3)),
        basis: `average of the last ${Math.min(3, inflowHistory.length)} periods`,
        observations: inflowHistory.length,
        certain: false,
      }]
    : [];

  const projectedNetCents =
    expectedInflows.reduce((s, l) => s + l.amountCents, 0) +
    expectedOutflows.filter((l) => !l.certain).reduce((s, l) => s + l.amountCents, 0);

  return {
    entity: String(ent.name),
    actuals,
    forecastPeriod,
    expectedOutflows: expectedOutflows.slice(0, 15),
    expectedInflows,
    projectedNetCents,
    committedOutflowCents,
    thinEvidenceCount: expectedOutflows.filter((l) => !l.certain && l.observations < 2).length,
  };
}
