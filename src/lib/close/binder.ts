import { db } from "../ingest/ingest";
import { reconcile, type Reconciliation } from "./reconciliation";

/**
 * The close binder: audit support, assembled.
 *
 * When an auditor asks "who checked this, when, and on what basis", the answer
 * has to be producible without anyone reconstructing it from memory. Everything
 * here is read back from the ledger - no figure is recomputed for the report,
 * because a binder that disagrees with the books is worse than no binder.
 */

export interface BinderTickmark {
  subjectRef: string; subjectType: string; assertedBy: string; actor: string;
  confidence: number | null; note: string; supportingRefs: string[]; at: string;
}
export interface BinderException {
  subjectRef: string; cause: string; amountCents: number; status: string;
  resolvedBy: string | null; resolution: string | null; touchSeconds: number | null;
}
export interface BinderEntry {
  memo: string; kind: string; status: string; preparer: string; approver: string | null;
  lines: { glCode: string; debitCents: number; creditCents: number }[];
}
export interface BinderRule {
  name: string; kind: string; status: string; adoptedBy: string | null;
  selfEvidenced: boolean; evidence: { periodCode: string; subjectRef: string; quote: string }[];
  backtest: { fired: number; correct: number; precision: number; periods: string[] } | null;
}

export interface Binder {
  entity: string; periodCode: string; preparedAt: string;
  run: { model: string | null; rulebookVersion: number; llmCalls: number; ruleHits: number; costMicros: number; finishedAt: string | null } | null;
  reconciliation: Reconciliation | null;
  tickmarks: BinderTickmark[];
  exceptions: BinderException[];
  journalEntries: BinderEntry[];
  rulesApplied: BinderRule[];
  counts: { tickmarks: number; superseded: number; exceptions: number; unresolved: number; entries: number; rules: number };
}

export async function buildBinder(entityName: string, periodCode: string): Promise<Binder | null> {
  const c = db();
  const { data: ent } = await c.from("entities").select("id, name").eq("name", entityName).maybeSingle();
  if (!ent) return null;
  const { data: per } = await c.from("periods").select("id").eq("entity_id", ent.id).eq("code", periodCode).maybeSingle();
  if (!per) return null;

  const [runs, marks, exceptions, corrections, entries, rules, accounts, reconciliation] = await Promise.all([
    c.from("close_runs").select("*").eq("period_id", per.id).order("started_at", { ascending: false }).limit(1),
    c.from("tickmarks").select("*").eq("period_id", per.id).order("created_at"),
    c.from("exceptions").select("*").eq("period_id", per.id),
    c.from("corrections").select("*").eq("period_id", per.id),
    c.from("journal_entries").select("*").eq("period_id", per.id),
    c.from("rules").select("*").eq("entity_id", ent.id).eq("status", "active"),
    c.from("gl_accounts").select("id, code").eq("entity_id", ent.id),
    reconcile(entityName, periodCode),
  ]);

  const acct = new Map((accounts.data ?? []).map((a) => [String(a.id), String(a.code)]));
  const run = (runs.data ?? [])[0] as Record<string, unknown> | undefined;

  const correctionByException = new Map<string, Record<string, unknown>>();
  for (const k of (corrections.data ?? []) as unknown as Record<string, unknown>[]) {
    correctionByException.set(String(k.exception_id), k);
  }

  const allMarks = ((marks.data ?? []) as unknown as Record<string, unknown>[]).map((t) => {
    const ev = ((t.evidence ?? []) as Record<string, unknown>[])[0] ?? {};
    return {
      subjectRef: String(ev.subjectRef ?? ""), subjectType: String(t.subject_type),
      assertedBy: String(t.asserted_by), actor: String(t.actor),
      confidence: t.confidence === null ? null : Number(t.confidence),
      note: String(ev.note ?? ""), supportingRefs: (ev.refs as string[] | undefined) ?? [],
      at: String(t.created_at),
    };
  });

  /*
   * A subject can be verified more than once - re-closing a period supersedes
   * rather than erases. The binder shows the verification that stands, and says
   * how many it replaced, so the chain is visible without burying the answer.
   */
  const current = new Map<string, BinderTickmark>();
  for (const t of allMarks) current.set(t.subjectRef, t);
  const tickmarks = [...current.values()];
  const supersededCount = allMarks.length - tickmarks.length;

  const exceptionRows: BinderException[] = ((exceptions.data ?? []) as unknown as Record<string, unknown>[]).map((e) => {
    const k = correctionByException.get(String(e.id));
    const proposal = (e.agent_proposal ?? {}) as Record<string, unknown>;
    return {
      subjectRef: String(proposal.subjectRef ?? ""), cause: String(e.cause),
      amountCents: Number(e.amount_cents), status: String(e.status),
      resolvedBy: k ? String(k.actor) : null,
      resolution: k ? JSON.stringify(k.human_decision) : null,
      touchSeconds: k ? Number(k.touch_seconds) : null,
    };
  });

  const journalEntries: BinderEntry[] = ((entries.data ?? []) as unknown as Record<string, unknown>[]).map((j) => ({
    memo: String(j.memo), kind: String(j.kind), status: String(j.status),
    preparer: String(j.preparer), approver: j.approver ? String(j.approver) : null,
    lines: ((j.lines ?? []) as Record<string, unknown>[]).map((l) => ({
      glCode: acct.get(String(l.gl_account_id)) ?? "—",
      debitCents: Number(l.debit_cents ?? 0), creditCents: Number(l.credit_cents ?? 0),
    })),
  }));

  const rulesApplied: BinderRule[] = ((rules.data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const b = (r.backtest ?? null) as Record<string, unknown> | null;
    return {
      name: String(r.name), kind: String(r.kind), status: String(r.status),
      adoptedBy: r.adopted_by ? String(r.adopted_by) : null,
      selfEvidenced: Boolean(r.self_evidenced),
      evidence: ((r.evidence ?? []) as Record<string, unknown>[]).map((e) => ({
        periodCode: String(e.periodCode ?? ""), subjectRef: String(e.subjectRef ?? ""), quote: String(e.quote ?? ""),
      })),
      backtest: b ? {
        fired: Number(b.wouldHaveFired ?? 0), correct: Number(b.wouldHaveBeenCorrect ?? 0),
        precision: Number(b.precision ?? 0), periods: (b.periodsReplayed as string[] | undefined) ?? [],
      } : null,
    };
  });

  return {
    entity: String(ent.name), periodCode, preparedAt: new Date().toISOString(),
    run: run ? {
      model: run.model ? String(run.model) : null,
      rulebookVersion: Number(run.rulebook_version ?? 0),
      llmCalls: Number(run.llm_calls ?? 0), ruleHits: Number(run.rule_hits ?? 0),
      costMicros: Number(run.cost_micros ?? 0),
      finishedAt: run.finished_at ? String(run.finished_at) : null,
    } : null,
    reconciliation,
    tickmarks, exceptions: exceptionRows, journalEntries, rulesApplied,
    counts: {
      tickmarks: tickmarks.length,
      superseded: supersededCount,
      exceptions: exceptionRows.length,
      unresolved: exceptionRows.filter((e) => e.status === "open").length,
      entries: journalEntries.length,
      rules: rulesApplied.length,
    },
  };
}

/** Tickmarks as a CSV, which is what an auditor actually asks to be sent. */
export function tickmarksCsv(b: Binder): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = ["entity", "period", "subject", "subject_type", "asserted_by", "actor", "confidence", "basis", "supporting_refs", "verified_at"];
  const rows = b.tickmarks.map((t) => [
    b.entity, b.periodCode, t.subjectRef, t.subjectType, t.assertedBy, t.actor,
    t.confidence === null ? "" : t.confidence.toFixed(3),
    t.note, t.supportingRefs.join(" "), t.at,
  ].map((x) => esc(String(x))).join(","));
  return [head.join(","), ...rows].join("\n");
}
