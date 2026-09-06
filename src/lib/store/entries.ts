import { db } from "../ingest/ingest";

/**
 * Journal entries awaiting a person.
 *
 * The agent drafts; it never posts. Approval is the control, so it is recorded
 * against a named approver and the database refuses an entry whose approver is
 * its preparer.
 */

export interface JournalLine { glCode: string; glName: string; debitCents: number; creditCents: number }
export interface PendingEntry {
  id: string; kind: string; memo: string; periodCode: string;
  preparer: string; status: string; createdAt: string;
  lines: JournalLine[]; totalCents: number;
}

export async function listEntries(status = "pending_approval"): Promise<PendingEntry[]> {
  const c = db();
  const { data } = await c
    .from("journal_entries")
    .select("id, kind, memo, lines, preparer, status, created_at, periods(code)")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(50);
  if (!data?.length) return [];

  const { data: accounts } = await c.from("gl_accounts").select("id, code, name");
  const byId = new Map((accounts ?? []).map((a) => [String(a.id), { code: String(a.code), name: String(a.name) }]));

  return (data as unknown as Record<string, unknown>[]).map((r) => {
    const raw = (r.lines ?? []) as Record<string, unknown>[];
    const lines = raw.map<JournalLine>((l) => {
      const acct = byId.get(String(l.gl_account_id));
      return {
        glCode: acct?.code ?? "—", glName: acct?.name ?? "unknown account",
        debitCents: Number(l.debit_cents ?? 0), creditCents: Number(l.credit_cents ?? 0),
      };
    });
    return {
      id: String(r.id), kind: String(r.kind), memo: String(r.memo),
      periodCode: (r.periods as { code?: string } | null)?.code ?? "",
      preparer: String(r.preparer), status: String(r.status), createdAt: String(r.created_at),
      lines, totalCents: lines.reduce((s, l) => s + l.debitCents, 0),
    };
  });
}

/**
 * Post an entry. The approver is recorded; the segregation trigger rejects the
 * write if it is the same principal that prepared it, so this cannot be
 * approved by the agent that drafted it.
 */
export async function decideEntry(id: string, approver: string, approve: boolean) {
  const c = db();
  if (!approve) {
    const { error } = await c.from("journal_entries").update({ status: "rejected", approver }).eq("id", id);
    if (error) throw new Error(`rejection refused: ${error.message}`);
    return;
  }
  const { error } = await c.from("journal_entries")
    .update({ status: "posted", approver, posted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`posting refused: ${error.message}`);
}
