import { db } from "../ingest/ingest";
import type { EntityScope } from "./queue";

/**
 * Journal entries awaiting a person.
 *
 * The agent drafts; it never posts. Approval is the control, so it is recorded
 * against a named approver and the database refuses an entry whose approver is
 * its preparer. Reads and writes are limited to a scope of entity ids, as in
 * the exception queue (src/lib/store/queue.ts).
 */

export interface JournalLine { glCode: string; glName: string; debitCents: number; creditCents: number }
export interface PendingEntry {
  id: string; entityId: string; entity: string; kind: string; memo: string; periodCode: string;
  preparer: string; status: string; createdAt: string;
  lines: JournalLine[]; totalCents: number;
}

export async function listEntries(scope: EntityScope, status = "pending_approval"): Promise<PendingEntry[]> {
  if (!scope.length) return [];
  const c = db();
  // each entity's latest successful run only, so a rerun never duplicates the queue
  const runIds = (await Promise.all(scope.map(async (entityId) => {
    const { data } = await c
      .from("close_runs")
      .select("id")
      .eq("entity_id", entityId)
      .eq("status", "succeeded")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.id ? String(data.id) : null;
  }))).filter((x): x is string => x !== null);
  if (!runIds.length) return [];

  const { data, error } = await c
    .from("journal_entries")
    .select("id, entity_id, kind, memo, lines, preparer, status, created_at, periods(code), entities(name)")
    .in("close_run_id", runIds)
    .in("entity_id", [...scope])
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`journal entries: ${error.message}`);
  if (!data?.length) return [];

  const { data: accounts } = await c.from("gl_accounts").select("id, code, name").in("entity_id", [...scope]);
  const byId = new Map((accounts ?? []).map((a) => [String(a.id), { code: String(a.code), name: String(a.name) }]));

  return (data as unknown as Record<string, unknown>[]).map((r) => {
    const raw = (r.lines ?? []) as Record<string, unknown>[];
    const lines = raw.map<JournalLine>((l) => {
      const acct = byId.get(String(l.gl_account_id));
      return {
        glCode: acct?.code ?? "-", glName: acct?.name ?? "unknown account",
        debitCents: Number(l.debit_cents ?? 0), creditCents: Number(l.credit_cents ?? 0),
      };
    });
    return {
      id: String(r.id), entityId: String(r.entity_id),
      entity: (r.entities as { name?: string } | null)?.name ?? "",
      kind: String(r.kind), memo: String(r.memo),
      periodCode: (r.periods as { code?: string } | null)?.code ?? "",
      preparer: String(r.preparer), status: String(r.status), createdAt: String(r.created_at),
      lines, totalCents: lines.reduce((s, l) => s + l.debitCents, 0),
    };
  });
}

/**
 * Post or reject an entry that is waiting for approval. The approver is
 * recorded; the segregation trigger rejects the write if it is the same
 * principal that prepared it, so this cannot be approved by the agent that
 * drafted it. A decided entry is final: it no longer matches, and the
 * database refuses to rewrite it (0008_tenancy.sql).
 */
export async function decideEntry(id: string, approver: string, approve: boolean, scope: EntityScope) {
  if (!scope.length) throw new Error("entry not found or already decided");
  const change = approve
    ? { status: "posted", approver, posted_at: new Date().toISOString() }
    : { status: "rejected", approver };
  const { data, error } = await db().from("journal_entries")
    .update(change)
    .eq("id", id)
    .in("entity_id", [...scope])
    .eq("status", "pending_approval")
    .select("id");
  if (error) throw new Error(`${approve ? "posting" : "rejection"} refused: ${error.message}`);
  if (!data?.length) throw new Error("entry not found or already decided");
}
