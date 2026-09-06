import { createClient } from "@supabase/supabase-js";
import { ADOPTION } from "../agent/gradient";
import { backtestAgainstHistory, codingPrecedent } from "../agent/backtest-db";
import { splitKey } from "../agent/close";
import type { Rule, RuleKind } from "../agent/types";
import type { SimulationReport } from "../agent/simulate";

/**
 * The exception queue, as rows rather than as a slide.
 *
 * Server-side only by construction: it holds the service-role client. Imported
 * by route handlers and by CLI scripts, so it deliberately does not take a
 * `server-only` dependency, which would break the scripts.
 *
 * A controller's resolution has to survive a page reload, be attributable, and
 * be replayable by an auditor. That means real writes - which is also the only
 * way the Standing Intent -> second correction -> proposed Rule sequence can be
 * demonstrated honestly rather than staged.
 */

const db = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

export const queueEnabled = () =>
  Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export interface QueueItem {
  id: string;
  subjectType: string;
  subjectRef: string;
  cause: string;
  amountCents: number;
  confidence: number | null;
  proposal: Record<string, unknown>;
  options: { label: string; value: unknown }[];
  vendor: string | null;
  periodCode: string;
}

export interface StandingIntentRow {
  id: string; kind: RuleKind; scope: Record<string, string>;
  status: string; actor: string; createdAt: string;
}

/**
 * Resolve the counterparty behind a queue item from the entity's own records:
 * an invoice knows its vendor, and a bank line is matched against the aliases a
 * vendor is actually known by on a statement.
 */
async function vendorResolver(entityId: string) {
  const c = db();
  const [{ data: vendors }, { data: invoices }] = await Promise.all([
    c.from("vendors").select("name, bank_aliases").eq("entity_id", entityId),
    c.from("ap_invoices").select("invoice_number, vendors(name)").eq("entity_id", entityId),
  ]);

  const byInvoice = new Map<string, string>();
  for (const r of (invoices ?? []) as unknown as Record<string, unknown>[]) {
    const name = (r.vendors as { name?: string } | null)?.name;
    if (name) byInvoice.set(String(r.invoice_number), name);
  }

  const aliases: { alias: string; vendor: string }[] = [];
  for (const v of (vendors ?? []) as unknown as Record<string, unknown>[]) {
    const name = String(v.name);
    for (const a of (v.bank_aliases as string[] | null) ?? []) aliases.push({ alias: a.toUpperCase(), vendor: name });
    aliases.push({ alias: name.toUpperCase(), vendor: name });
  }
  aliases.sort((a, b) => b.alias.length - a.alias.length);

  return (ref: string, description = "") => {
    const direct = byInvoice.get(ref) ?? byInvoice.get(ref.split("+")[0]);
    if (direct) return direct;
    const hay = `${description} ${ref}`.toUpperCase();
    return aliases.find((a) => hay.includes(a.alias.slice(0, 12)))?.vendor ?? null;
  };
}

// ── publishing a measured run into the queue ─────────────────────────────────

/**
 * Materialise a run's exceptions as working rows.
 *
 * `lastN` opens more than one period at once. A vendor usually appears once per
 * period, so the second correction that seconds a standing intent naturally
 * arrives in the following month - which is exactly how a controller would
 * experience it.
 */
export async function publishRun(
  report: SimulationReport, opts: { lastN?: number } = {},
): Promise<{ entityId: string; opened: number }> {
  const c = db();
  const wanted = report.periods.slice(-Math.max(1, opts.lastN ?? 1));
  let openedTotal = 0;
  let entityIdOut = "";
  for (const last of wanted) {

  const { data: ent } = await c.from("entities").select("id").eq("name", report.entity).maybeSingle();
  const entityId = ent?.id ?? (await c.from("entities").insert({ name: report.entity }).select("id").single()).data!.id;

  const { data: per } = await c.from("periods").select("id").eq("entity_id", entityId).eq("code", last.period).maybeSingle();
  const periodId = per?.id ?? (await c.from("periods").insert({
    entity_id: entityId, code: last.period,
    start_date: `${last.period}-01`, end_date: `${last.period}-28`, cutoff_date: `${last.period}-28`,
    status: "in_close",
  }).select("id").single()).data!.id;

  const { data: run } = await c.from("close_runs").insert({
    entity_id: entityId, period_id: periodId,
    rulebook_version: last.rulebookVersionOut, status: "succeeded",
    model: report.model, llm_calls: last.stats.llmCalls, rule_hits: last.stats.ruleHits,
    cost_micros: last.stats.costMicros, stats: last.stats,
  }).select("id").single();

  await c.from("exceptions").delete().eq("entity_id", entityId).eq("period_id", periodId);

  const rows = last.exceptions.map((e) => ({
    entity_id: entityId, period_id: periodId, close_run_id: run!.id,
    subject_type: e.subjectType === "accrual" ? "ap_invoice" : e.subjectType,
    subject_id: entityId,
    cause: e.cause, amount_cents: e.amountCents, confidence: e.confidence,
    agent_proposal: { ...(e.proposal as object), subjectRef: e.subjectRef, subjectType: e.subjectType },
    options: e.options, status: "open",
  }));
  if (rows.length) {
    const { error } = await c.from("exceptions").insert(rows);
    if (error) throw new Error(`publish failed: ${error.message}`);
  }
    openedTotal += rows.length;
    entityIdOut = entityId;
  }
  return { entityId: entityIdOut, opened: openedTotal };
}

export async function listQueue(limit = 40): Promise<{ items: QueueItem[]; periodCode: string } | null> {
  if (!queueEnabled()) return null;
  const c = db();
  const { data } = await c
    .from("exceptions")
    .select("id, entity_id, subject_type, cause, amount_cents, confidence, agent_proposal, options, period_id, periods(code)")
    .eq("status", "open")
    .order("amount_cents", { ascending: true })
    .limit(limit);
  if (!data?.length) return null;

  const resolveVendor = await vendorResolver(String(data[0].entity_id));

  const items: QueueItem[] = data.map((r) => {
    const p = (r.agent_proposal ?? {}) as Record<string, unknown>;
    const ref = String(p.subjectRef ?? "");
    return {
      id: r.id as string,
      subjectType: String(p.subjectType ?? r.subject_type),
      subjectRef: ref,
      cause: r.cause as string,
      amountCents: Number(r.amount_cents),
      confidence: r.confidence === null ? null : Number(r.confidence),
      proposal: p,
      options: (r.options ?? []) as QueueItem["options"],
      vendor: resolveVendor(ref, String(p.description ?? "")),
      periodCode: (r.periods as unknown as { code: string })?.code ?? "",
    };
  });
  return { items, periodCode: items[0]?.periodCode ?? "" };
}

export const listIntents = async (): Promise<StandingIntentRow[]> => {
  if (!queueEnabled()) return [];
  const { data } = await db().from("standing_intents")
    .select("id, kind, scope, status, actor, created_at").order("created_at", { ascending: false }).limit(20);
  return (data ?? []).map((r) => ({
    id: r.id as string, kind: r.kind as RuleKind, scope: r.scope as Record<string, string>,
    status: r.status as string, actor: r.actor as string, createdAt: r.created_at as string,
  }));
};

export const listRules = async (): Promise<(Rule & { adoptedBy?: string; selfEvidenced?: boolean })[]> => {
  if (!queueEnabled()) return [];
  const { data } = await db().from("rules").select("*").order("created_at", { ascending: false }).limit(30);
  return (data ?? []).map((r) => ({
    id: r.id as string, kind: r.kind as RuleKind, name: r.name as string,
    predicate: r.predicate as Rule["predicate"], action: r.action as Rule["action"],
    status: r.status as Rule["status"], version: r.version as number,
    evidence: (r.evidence ?? []) as Rule["evidence"], backtest: (r.backtest ?? null) as Rule["backtest"],
    hitCount: (r.hit_count ?? 0) as number, createdAt: r.created_at as string,
    adoptedBy: (r.adopted_by ?? undefined) as string | undefined,
    selfEvidenced: Boolean(r.self_evidenced),
  }));
};

// ── the ruling that makes the loop turn ──────────────────────────────────────

export type ResolveOutcome =
  | { kind: "resolved" }
  | { kind: "intent_recorded"; scope: string }
  | { kind: "rule_proposed"; ruleId: string; ruleName: string; precision: number; fired: number; adoptable: boolean };

/**
 * Resolve one exception. If the controller asked for it to become standing
 * policy, this is where the evidence gate is actually applied: the first ask
 * only records intent, and the rule is proposed when a second correction
 * corroborates it.
 */
export async function resolveException(
  exceptionId: string, decision: Record<string, unknown>, actor: string, alwaysDoThis: boolean,
): Promise<ResolveOutcome> {
  const c = db();
  const { data: ex } = await c.from("exceptions")
    .select("id, entity_id, period_id, cause, amount_cents, agent_proposal").eq("id", exceptionId).single();
  if (!ex) throw new Error("exception not found");

  const proposal = (ex.agent_proposal ?? {}) as Record<string, unknown>;
  const subjectRef = String(proposal.subjectRef ?? "");
  const subjectType = String(proposal.subjectType ?? "ap_invoice");
  const kind: RuleKind = subjectType === "ap_invoice" ? "coding" : subjectType === "accrual" ? "accrual" : "matching";
  const vendor = (await vendorResolver(ex.entity_id as string))(subjectRef, String(proposal.description ?? ""));

  const { data: corr } = await c.from("corrections").insert({
    entity_id: ex.entity_id, period_id: ex.period_id, exception_id: exceptionId,
    action: decision.action ?? "amend",
    agent_proposal: proposal, human_decision: decision, actor, touch_seconds: 45,
    note: String(decision.note ?? ""),
  }).select("id").single();

  await c.from("exceptions").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", exceptionId);

  if (!alwaysDoThis || !vendor) return { kind: "resolved" };

  const scope = { vendor };
  const { data: open } = await c.from("standing_intents")
    .select("id, correction_id, actor").eq("entity_id", ex.entity_id)
    .eq("kind", kind).eq("status", "open").contains("scope", scope).maybeSingle();

  // first ask: record the instruction, do not act on it
  if (!open) {
    await c.from("standing_intents").insert({
      entity_id: ex.entity_id, period_id: ex.period_id, correction_id: corr!.id,
      kind, scope, actor, status: "open",
    });
    return { kind: "intent_recorded", scope: vendor };
  }

  // seconded: now there are two distinct corrections, so a rule may be proposed
  const periodCode = await periodCodeOf(ex.period_id as string);
  const rule = await proposeRuleFor(ex.entity_id as string, kind, vendor, [open.correction_id as string, corr!.id as string], periodCode);
  await c.from("standing_intents").update({
    status: "seconded", seconded_by_correction_id: corr!.id,
    seconded_at: new Date().toISOString(), became_rule_id: rule.id,
  }).eq("id", open.id);

  const sameActor = open.actor === actor;
  const { data: saved, error } = await c.from("rules").insert({
    entity_id: ex.entity_id, kind: rule.kind, name: rule.name,
    predicate: rule.predicate, action: rule.action, status: "proposed",
    evidence: rule.evidence, backtest: rule.backtest, self_evidenced: sameActor,
  }).select("id").single();
  if (error) throw new Error(`rule proposal failed: ${error.message}`);

  return {
    kind: "rule_proposed", ruleId: saved!.id as string, ruleName: rule.name,
    precision: rule.backtest?.precision ?? 0, fired: rule.backtest?.wouldHaveFired ?? 0,
    adoptable: meetsAdoptionBar(rule.backtest),
  };
}

const periodCodeOf = async (periodId: string) => {
  const { data } = await db().from("periods").select("code").eq("id", periodId).single();
  return String(data?.code ?? "9999-12");
};

/**
 * Build the rule a pair of corrections supports, then judge it against the
 * entity's own closed history.
 *
 * For a matching rule the settlement shape is not declared anywhere - it is
 * discovered, by replaying each candidate strategy over real bank lines and
 * keeping whichever one actually balances.
 */
async function proposeRuleFor(
  entityId: string, kind: RuleKind, vendor: string, correctionIds: string[], beforeCode: string,
): Promise<Rule> {
  const base = {
    id: crypto.randomUUID(),
    status: "proposed" as const,
    version: 1,
    evidence: correctionIds.map((id) => ({
      correctionId: id, periodCode: beforeCode, subjectRef: vendor,
      quote: `controller resolved a ${kind} exception for ${vendor} and asked for it to become standing policy`,
    })),
    backtest: null,
    hitCount: 0,
    createdAt: new Date().toISOString(),
  };

  if (kind === "coding") {
    const precedent = await codingPrecedent(entityId, vendor, beforeCode);
    if (!precedent) {
      const rule: Rule = {
        ...base, kind, name: `${vendor} — no coding precedent`,
        predicate: [{ op: "vendor_is", value: vendor }],
        action: { type: "always_review", reason: "no coded history for this vendor yet" },
      };
      rule.backtest = await backtestAgainstHistory(rule, entityId, beforeCode);
      return rule;
    }
    const rule: Rule = {
      ...base, kind,
      name: `${vendor} → ${precedent.glCode} (${splitKey(precedent.deptSplit)})`,
      predicate: [{ op: "vendor_is", value: vendor }],
      action: { type: "code", glCode: precedent.glCode, deptSplit: precedent.deptSplit },
    };
    rule.backtest = await backtestAgainstHistory(rule, entityId, beforeCode);
    return rule;
  }

  const { data: v } = await db().from("vendors").select("bank_aliases").eq("entity_id", entityId).eq("name", vendor).maybeSingle();
  const aliases = ((v?.bank_aliases as string[] | null) ?? []).filter(Boolean);

  /**
   * A vendor does not appear on a statement under one wording. Gusto is
   * "GUSTO PAYROLL 8AM-5PM" one month and "GUSTO TAX COLLECTION" the next, so a
   * predicate cut from a single month's phrasing learns nothing that survives
   * to the following one. Key on every alias the vendor is known by, plus the
   * name itself, and let the backtest decide whether that was enough.
   */
  const escape = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const alternates = [...new Set([...aliases.map((a) => a.slice(0, 16)), vendor])]
    .filter((a) => a.length >= 4)
    .map(escape);
  const pattern = alternates.length ? alternates.join("|") : escape(vendor);

  let best: Rule | null = null;
  for (const strategy of ["by_invoice", "same_day_settlement", "installments"] as const) {
    for (const deltaReason of [null, "fx", "bank_fee", "partial"] as const) {
      const candidate: Rule = {
        ...base, id: crypto.randomUUID(), kind,
        name: `${vendor} settles ${strategy.replace(/_/g, " ")}${deltaReason ? ` · ${deltaReason}` : ""}`,
        predicate: [{ op: "desc_matches", value: pattern }],
        action: { type: "match", vendorName: vendor, strategy, deltaReason, tolerancePct: 0.03 },
      };
      candidate.backtest = await backtestAgainstHistory(candidate, entityId, beforeCode);
      const b = candidate.backtest;
      const better = !best?.backtest
        || b.precision > best.backtest.precision
        || (b.precision === best.backtest.precision && b.wouldHaveFired > best.backtest.wouldHaveFired);
      if (better) best = candidate;
    }
  }
  return best!;
}

/** The human gate. Adoption names its approver; the trigger enforces that. */
export const meetsAdoptionBar = (b: Rule["backtest"]) =>
  !!b && b.wouldHaveFired >= ADOPTION.minFired && b.precision >= ADOPTION.minPrecision;

/**
 * The human gate. Adoption names its approver - the trigger enforces that - and
 * a rule that did not survive the replay cannot be adopted at all. Having *a*
 * backtest is not the bar; passing it is.
 */
export async function adoptRule(ruleId: string, actor: string, accept: boolean) {
  const c = db();
  if (!accept) {
    await c.from("rules").update({ status: "rejected" }).eq("id", ruleId);
    return;
  }

  const { data: rule } = await c.from("rules").select("name, backtest").eq("id", ruleId).single();
  const b = (rule?.backtest ?? null) as Rule["backtest"];
  if (!meetsAdoptionBar(b)) {
    throw new Error(
      `"${rule?.name}" cannot be adopted: the replay fired ${b?.wouldHaveFired ?? 0}× at ` +
      `${((b?.precision ?? 0) * 100).toFixed(0)}% precision, below the bar of ` +
      `${ADOPTION.minFired}× at ${ADOPTION.minPrecision * 100}%.`,
    );
  }

  const { error } = await c.from("rules")
    .update({ status: "active", adopted_by: actor, activated_at: new Date().toISOString() })
    .eq("id", ruleId);
  if (error) throw new Error(`adoption refused: ${error.message}`);
}
