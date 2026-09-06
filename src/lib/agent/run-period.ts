import { db } from "../ingest/ingest";
import { runClose } from "./close";
import type { ChartContext, VendorHistoryRow } from "./llm";
import { DEFAULT_MODEL, type ModelId } from "./pricing";
import { emptyRulebook } from "./rules";
import type { ApInvoice, BankLine, ClosePeriodData, CloseRunResult, LedgerEntry, Rule, Rulebook } from "./types";

/**
 * Run a close against books that were actually ingested, and write what it
 * decided back to the ledger.
 *
 * Everything before this ran the agent over generated data and kept the result
 * in memory. That is an eval harness, not a product: a close that leaves no
 * tickmark behind has not closed anything.
 */

const rows = async (table: string, entityId: string, periodId: string) => {
  const { data, error } = await db().from(table).select("*").eq("entity_id", entityId).eq("period_id", periodId);
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as unknown as Record<string, unknown>[];
};

export interface LoadedPeriod {
  periodId: string;
  period: ClosePeriodData;
  chart: ChartContext;
  history: VendorHistoryRow[];
  recurringHistory: Record<string, number[]>;
}

export async function loadPeriod(entityId: string, code: string): Promise<LoadedPeriod> {
  const c = db();
  const { data: per } = await c.from("periods").select("id").eq("entity_id", entityId).eq("code", code).maybeSingle();
  if (!per) throw new Error(`period ${code} has not been ingested for this entity`);
  const periodId = per.id as string;

  const [accounts, depts, vendors, ent] = await Promise.all([
    c.from("gl_accounts").select("*").eq("entity_id", entityId),
    c.from("departments").select("*").eq("entity_id", entityId),
    c.from("vendors").select("*").eq("entity_id", entityId),
    c.from("entities").select("*").eq("id", entityId).single(),
  ]);
  const acctById = new Map((accounts.data ?? []).map((a) => [a.id as string, a.code as string]));
  const deptById = new Map((depts.data ?? []).map((d) => [d.id as string, d.code as string]));
  const vendById = new Map((vendors.data ?? []).map((v) => [v.id as string, v.name as string]));

  const [bank, ledger, invoices] = await Promise.all([
    rows("bank_lines", entityId, periodId),
    rows("ledger_entries", entityId, periodId),
    rows("ap_invoices", entityId, periodId),
  ]);

  const period: ClosePeriodData = {
    code,
    bankLines: bank.map<BankLine>((b) => ({
      externalId: String(b.external_id), postedDate: String(b.posted_date),
      description: String(b.description), amountCents: Number(b.amount_cents), currency: String(b.currency),
    })),
    ledgerEntries: ledger.map<LedgerEntry>((l) => ({
      externalId: String(l.external_id), entryDate: String(l.entry_date),
      glCode: acctById.get(String(l.gl_account_id)) ?? null,
      deptCode: deptById.get(String(l.department_id)) ?? null,
      vendorName: vendById.get(String(l.vendor_id)) ?? null,
      amountCents: Number(l.amount_cents), memo: String(l.memo ?? ""), source: String(l.source ?? "manual"),
    })),
    apInvoices: invoices.map<ApInvoice>((i) => ({
      vendorName: vendById.get(String(i.vendor_id)) ?? "",
      invoiceNumber: String(i.invoice_number), invoiceDate: String(i.invoice_date),
      dueDate: String(i.due_date), amountCents: Number(i.amount_cents),
      currency: String(i.currency), description: String(i.description ?? ""), lineItems: [],
    })),
    // no answer key: these are someone's actual books
  };

  const chart: ChartContext = {
    accounts: (accounts.data ?? []).map((a) => ({ code: a.code as string, name: a.name as string, type: a.type as string })),
    departments: (depts.data ?? []).map((d) => ({ code: d.code as string, name: d.name as string })),
    materialityCents: Number(ent.data?.materiality_cents ?? 2_500_000),
    ruleCeilingCents: Number(ent.data?.rule_ceiling_cents ?? 25_000_000),
  };

  // what a human already accepted in earlier periods, which is the only
  // precedent the agent is entitled to lean on
  const { data: priorInv } = await c
    .from("ap_invoices").select("invoice_number, vendor_id, gl_account_id, amount_cents, period_id, periods(code)")
    .eq("entity_id", entityId);
  const agg = new Map<string, VendorHistoryRow>();
  const recurringHistory: Record<string, number[]> = {};
  for (const r of (priorInv ?? []) as unknown as Record<string, unknown>[]) {
    const pc = (r.periods as { code?: string } | null)?.code ?? "";
    if (!pc || pc >= code) continue;   // only what is already closed behind us
    const vendor = vendById.get(String(r.vendor_id)) ?? "";
    if (!vendor) continue;

    // What this vendor has historically billed. Built from PRIOR periods only -
    // taking it from the current one would mean every vendor in it had already
    // invoiced, and nothing could ever be found missing.
    (recurringHistory[vendor] ??= []).push(Number(r.amount_cents));

    const glCode = acctById.get(String(r.gl_account_id)) ?? "";
    if (!glCode) continue;
    const k = `${vendor}|${glCode}`;
    const row = agg.get(k);
    if (row) { row.timesSeen++; row.lastPeriod = pc; }
    else agg.set(k, { vendor, glCode, deptSplit: "", timesSeen: 1, lastPeriod: pc });
  }

  return {
    periodId, period, chart,
    history: [...agg.values()].sort((a, b) => b.timesSeen - a.timesSeen),
    recurringHistory,
  };
}

/** The Rulebook this entity has actually earned. */
export async function loadRulebook(entityId: string): Promise<Rulebook> {
  const { data } = await db().from("rules").select("*").eq("entity_id", entityId).eq("status", "active");
  const rules = ((data ?? []) as unknown as Record<string, unknown>[]).map<Rule>((r) => ({
    id: String(r.id), kind: r.kind as Rule["kind"], name: String(r.name),
    predicate: r.predicate as Rule["predicate"], action: r.action as Rule["action"],
    status: "active", version: Number(r.version ?? 1),
    evidence: (r.evidence ?? []) as Rule["evidence"], backtest: (r.backtest ?? null) as Rule["backtest"],
    hitCount: Number(r.hit_count ?? 0), createdAt: String(r.created_at),
  }));
  return { version: rules.length, rules };
}

export interface PersistedRun { closeRunId: string; tickmarks: number; exceptions: number; journalEntries: number }

/** Write what the close decided: the run, its tickmarks, its queue, its accruals. */
export async function persistRun(
  entityId: string, periodId: string, result: CloseRunResult, model: ModelId,
): Promise<PersistedRun> {
  const c = db();

  const { data: run, error: runErr } = await c.from("close_runs").insert({
    entity_id: entityId, period_id: periodId, rulebook_version: result.rulebookVersion,
    status: "succeeded", model: String(model),
    tokens_in: result.stats.tokensIn, tokens_out: result.stats.tokensOut,
    cost_micros: result.stats.costMicros, llm_calls: result.stats.llmCalls,
    rule_hits: result.stats.ruleHits, duration_ms: result.stats.durationMs,
    stats: result.stats, finished_at: new Date().toISOString(),
  }).select("id").single();
  if (runErr) throw new Error(`close run: ${runErr.message}`);
  const closeRunId = run!.id as string;

  if (result.matches.length) {
    // Store the actual rows a match links, not a description of them. A
    // reconciliation has to be recomputable from the ledger, and a text field
    // is not joinable.
    const [{ data: bankRows }, { data: ledRows }] = await Promise.all([
      c.from("bank_lines").select("id, external_id").eq("entity_id", entityId).eq("period_id", periodId),
      c.from("ledger_entries").select("id, external_id").eq("entity_id", entityId).eq("period_id", periodId),
    ]);
    const bankId = new Map((bankRows ?? []).map((r) => [String(r.external_id), String(r.id)]));
    const ledId = new Map((ledRows ?? []).map((r) => [String(r.external_id), String(r.id)]));

    const { error } = await c.from("matches").insert(result.matches.map((m) => ({
      entity_id: entityId, period_id: periodId, close_run_id: closeRunId,
      bank_line_ids: m.bankExternalIds.map((x) => bankId.get(x)).filter(Boolean),
      ledger_entry_ids: m.ledgerExternalIds.map((x) => ledId.get(x)).filter(Boolean),
      cardinality: m.cardinality, amount_delta_cents: m.amountDeltaCents,
      delta_reason: m.deltaReason, confidence: m.confidence,
      decided_by: m.decidedBy,
      reasoning: `${m.bankExternalIds.join("+")} ← ${m.ledgerExternalIds.join("+")}${m.reasoning ? ` · ${m.reasoning}` : ""}`,
    })));
    if (error) throw new Error(`matches: ${error.message}`);
  }

  // the point of the product: a verification that outlives the run
  if (result.tickmarks.length) {
    const { error } = await c.from("tickmarks").insert(result.tickmarks.map((t) => ({
      entity_id: entityId, period_id: periodId, close_run_id: closeRunId,
      subject_type: t.subjectType, subject_id: entityId,
      asserted_by: t.assertedBy, actor: t.assertedBy === "rule" ? "rulebook" : String(model),
      confidence: t.confidence,
      evidence: [{ subjectRef: t.subjectRef, ...(t.evidence[0] ?? {}) }],
    })));
    if (error) throw new Error(`tickmarks: ${error.message}`);
  }

  await c.from("exceptions").delete().eq("entity_id", entityId).eq("period_id", periodId).eq("status", "open");
  if (result.exceptions.length) {
    const { error } = await c.from("exceptions").insert(result.exceptions.map((e) => ({
      entity_id: entityId, period_id: periodId, close_run_id: closeRunId,
      subject_type: e.subjectType === "accrual" ? "ap_invoice" : e.subjectType,
      subject_id: entityId, cause: e.cause, amount_cents: e.amountCents, confidence: e.confidence,
      agent_proposal: { ...(e.proposal as object), subjectRef: e.subjectRef, subjectType: e.subjectType },
      options: e.options, status: "open",
    })));
    if (error) throw new Error(`exceptions: ${error.message}`);
  }

  // accruals are real entries, drafted for a human to approve - never posted
  let journalEntries = 0;
  if (result.accruals.length) {
    const { data: accounts } = await c.from("gl_accounts").select("id, code").eq("entity_id", entityId);
    const byCode = new Map((accounts ?? []).map((a) => [a.code as string, a.id as string]));
    const accrued = byCode.get("2100");
    const entries = result.accruals.flatMap((a) => {
      const expense = byCode.get(a.glCode);
      if (!expense || !accrued) return [];
      return [{
        entity_id: entityId, period_id: periodId, close_run_id: closeRunId,
        kind: "accrual", memo: `Accrue ${a.vendorName} — ${a.reasoning ?? "recurring cost not yet invoiced"}`,
        lines: [
          { gl_account_id: expense, debit_cents: a.amountCents, credit_cents: 0 },
          { gl_account_id: accrued, debit_cents: 0, credit_cents: a.amountCents },
        ],
        preparer: `agent:${model}`, status: "pending_approval",
      }];
    });
    if (entries.length) {
      const { error } = await c.from("journal_entries").insert(entries);
      if (error) throw new Error(`journal entries: ${error.message}`);
      journalEntries = entries.length;
    }
  }

  return { closeRunId, tickmarks: result.tickmarks.length, exceptions: result.exceptions.length, journalEntries };
}

/** Load, run, persist. The whole close, on real books. */
export async function closePeriod(entityName: string, code: string, model: ModelId = DEFAULT_MODEL) {
  const c = db();
  const { data: ent } = await c.from("entities").select("id, auto_tickmark_threshold").eq("name", entityName).maybeSingle();
  if (!ent) throw new Error(`no entity named "${entityName}" — ingest its books first`);
  const entityId = ent.id as string;

  const loaded = await loadPeriod(entityId, code);
  const rulebook = await loadRulebook(entityId).catch(() => emptyRulebook());

  // a vendor can only be accrued to an account it has actually been coded to
  const accountByVendor = new Map(loaded.history.map((h) => [h.vendor, h.glCode]));

  const result = await runClose({
    period: loaded.period, rulebook, chart: loaded.chart,
    history: loaded.history, recurringHistory: loaded.recurringHistory,
    autoThreshold: Number(ent.auto_tickmark_threshold ?? 0.9), model,
    accrualAccountFor: (v) => accountByVendor.get(v) ?? null,
  });

  const persisted = await persistRun(entityId, loaded.periodId, result, model);
  return { entityId, result, persisted, rulebookVersion: rulebook.version };
}

/**
 * Entities with books someone could actually close.
 *
 * A period on its own is not books - a verification suite leaves entities
 * behind precisely because tickmarks refuse deletion, and those must never
 * surface as something to reconcile. An entity counts only once transactions
 * have been ingested against it.
 */
export async function listEntitiesWithPeriods(): Promise<{ name: string; periods: string[] }[]> {
  const c = db();
  const [{ data: ents }, { data: pers }, { data: bank }, { data: inv }] = await Promise.all([
    c.from("entities").select("id, name").order("name"),
    c.from("periods").select("entity_id, code").order("code"),
    c.from("bank_lines").select("entity_id"),
    c.from("ap_invoices").select("entity_id"),
  ]);
  if (!ents?.length) return [];

  const withBooks = new Set<string>([
    ...(bank ?? []).map((r) => String(r.entity_id)),
    ...(inv ?? []).map((r) => String(r.entity_id)),
  ]);

  const byEntity = new Map<string, string[]>();
  for (const p of pers ?? []) {
    const k = String(p.entity_id);
    (byEntity.get(k) ?? byEntity.set(k, []).get(k)!).push(String(p.code));
  }

  return ents
    .filter((e) => withBooks.has(String(e.id)))
    .map((e) => ({ name: String(e.name), periods: byEntity.get(String(e.id)) ?? [] }))
    .filter((e) => e.periods.length);
}
