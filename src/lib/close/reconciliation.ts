import { db } from "../ingest/ingest";

/**
 * The bank reconciliation, as a controller expects to read it.
 *
 * Not a dashboard metric - a statement of what ties, what does not, and why.
 * Every unreconciled line is listed with an amount, because "97% reconciled" is
 * not something anyone can sign.
 */

export interface ReconcilingItem {
  ref: string; date: string; description: string; amountCents: number; reason: string;
}

export interface Reconciliation {
  periodCode: string;
  bankLineCount: number;
  bankMovementCents: number;
  matchedBankCount: number;
  matchedBankCents: number;
  /** on the statement, nothing in the ledger explains it yet */
  outstanding: ReconcilingItem[];
  /** posted to the ledger, not yet on the statement */
  inLedgerNotOnBank: ReconcilingItem[];
  /** residuals inside matches, named: fx, bank fee, partial settlement */
  explainedDifferences: { reason: string; count: number; amountCents: number }[];
  unexplainedCents: number;
  tiesOut: boolean;
}

export async function reconcile(entityName: string, periodCode: string): Promise<Reconciliation | null> {
  const c = db();
  const { data: ent } = await c.from("entities").select("id").eq("name", entityName).maybeSingle();
  if (!ent) return null;
  const { data: per } = await c.from("periods").select("id").eq("entity_id", ent.id).eq("code", periodCode).maybeSingle();
  if (!per) return null;

  const [{ data: bank }, { data: led }, { data: matches }] = await Promise.all([
    c.from("bank_lines").select("id, external_id, posted_date, description, amount_cents").eq("period_id", per.id),
    c.from("ledger_entries").select("id, external_id, entry_date, memo, amount_cents, source").eq("period_id", per.id),
    c.from("matches").select("bank_line_ids, ledger_entry_ids, amount_delta_cents, delta_reason").eq("period_id", per.id),
  ]);

  const bankRows = (bank ?? []) as unknown as Record<string, unknown>[];
  const ledRows = (led ?? []) as unknown as Record<string, unknown>[];
  const matchRows = (matches ?? []) as unknown as Record<string, unknown>[];

  const matchedBank = new Set<string>();
  const matchedLed = new Set<string>();
  const byReason = new Map<string, { count: number; amountCents: number }>();
  let unexplained = 0;

  for (const m of matchRows) {
    for (const id of (m.bank_line_ids as string[] | null) ?? []) matchedBank.add(id);
    for (const id of (m.ledger_entry_ids as string[] | null) ?? []) matchedLed.add(id);
    const delta = Number(m.amount_delta_cents ?? 0);
    if (delta === 0) continue;
    const reason = String(m.delta_reason ?? "");
    if (!reason) { unexplained += delta; continue; }
    const e = byReason.get(reason) ?? { count: 0, amountCents: 0 };
    e.count++; e.amountCents += delta;
    byReason.set(reason, e);
  }

  const outstanding: ReconcilingItem[] = bankRows
    .filter((b) => !matchedBank.has(String(b.id)))
    .map((b) => ({
      ref: String(b.external_id), date: String(b.posted_date),
      description: String(b.description), amountCents: Number(b.amount_cents),
      reason: "on the statement, not yet explained by the ledger",
    }))
    .sort((a, b) => Math.abs(b.amountCents) - Math.abs(a.amountCents));

  const inLedgerNotOnBank: ReconcilingItem[] = ledRows
    .filter((l) => !matchedLed.has(String(l.id)))
    .map((l) => ({
      ref: String(l.external_id), date: String(l.entry_date),
      description: String(l.memo || l.source), amountCents: Number(l.amount_cents),
      reason: "posted to the ledger, not yet on the statement",
    }))
    .sort((a, b) => Math.abs(b.amountCents) - Math.abs(a.amountCents));

  const bankMovementCents = bankRows.reduce((s, b) => s + Number(b.amount_cents), 0);
  const matchedBankCents = bankRows
    .filter((b) => matchedBank.has(String(b.id)))
    .reduce((s, b) => s + Number(b.amount_cents), 0);

  return {
    periodCode,
    bankLineCount: bankRows.length,
    bankMovementCents,
    matchedBankCount: matchedBank.size,
    matchedBankCents,
    outstanding: outstanding.slice(0, 40),
    inLedgerNotOnBank: inLedgerNotOnBank.slice(0, 40),
    explainedDifferences: [...byReason.entries()]
      .map(([reason, v]) => ({ reason, ...v }))
      .sort((a, b) => Math.abs(b.amountCents) - Math.abs(a.amountCents)),
    unexplainedCents: unexplained,
    tiesOut: unexplained === 0 && outstanding.length === 0 && inLedgerNotOnBank.length === 0,
  };
}
