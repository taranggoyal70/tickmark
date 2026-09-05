/**
 * The Rulebook engine.
 *
 * Everything here is deterministic and costs zero tokens. That is the whole
 * point: a Correction gets compiled into a Rule once, and from then on the
 * judgment it encodes executes for free. Cost per close falls as the agent
 * learns, instead of rising with the size of its prompt.
 */
import type {
  AccrualProposal, ApInvoice, BankLine, BacktestResult, CodingDecision, DeltaReason,
  LedgerEntry, MatchDecision, Predicate, Rule, Rulebook,
} from "./types";

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export interface PredicateContext {
  vendorName?: string | null;
  description?: string;
  amountCents?: number;
  source?: string;
  cadence?: string;
}

export function evaluate(preds: Predicate[], ctx: PredicateContext): boolean {
  return preds.every((p) => {
    switch (p.op) {
      case "vendor_is":     return norm(ctx.vendorName ?? "") === norm(String(p.value));
      case "desc_contains": return norm(ctx.description ?? "").includes(norm(String(p.value)));
      case "desc_matches":  { try { return new RegExp(String(p.value), "i").test(ctx.description ?? ""); } catch { return false; } }
      case "amount_gte":    return (ctx.amountCents ?? 0) >= Number(p.value);
      case "amount_lte":    return (ctx.amountCents ?? 0) <= Number(p.value);
      case "source_is":     return ctx.source === String(p.value);
      case "cadence_is":    return ctx.cadence === String(p.value);
      default:              return false;
    }
  });
}

export const activeRules = (rb: Rulebook, kind: Rule["kind"]) =>
  rb.rules.filter((r) => r.status === "active" && r.kind === kind);

// ── coding ───────────────────────────────────────────────────────────────────

export function applyCodingRules(rb: Rulebook, inv: ApInvoice): CodingDecision | null {
  for (const rule of activeRules(rb, "coding")) {
    if (rule.action.type !== "code") continue;
    const hit = evaluate(rule.predicate, {
      vendorName: inv.vendorName,
      description: `${inv.vendorName} ${inv.description}`,
      amountCents: inv.amountCents,
    });
    if (!hit) continue;
    return {
      invoiceNumber: inv.invoiceNumber,
      glCode: rule.action.glCode,
      deptSplit: rule.action.deptSplit,
      confidence: 0.99,
      decidedBy: "rule",
      ruleId: rule.id,
      reasoning: `Rule "${rule.name}"`,
    };
  }
  return null;
}

/** A materiality rule can force a human look even when a coding rule is certain. */
export function forcesReview(rb: Rulebook, ctx: PredicateContext): string | null {
  for (const rule of activeRules(rb, "materiality")) {
    if (rule.action.type !== "always_review") continue;
    if (evaluate(rule.predicate, ctx)) return rule.action.reason;
  }
  return null;
}

// ── matching ─────────────────────────────────────────────────────────────────

const daysBetween = (a: string, b: string) =>
  Math.abs((Date.parse(a) - Date.parse(b)) / 86_400_000);

/** Ledger lines from one invoice share a memo, which is how we regroup a split. */
const groupByMemo = (entries: LedgerEntry[]) => {
  const g = new Map<string, LedgerEntry[]>();
  for (const e of entries) {
    const k = e.memo || e.externalId;
    (g.get(k) ?? g.set(k, []).get(k)!).push(e);
  }
  return [...g.values()];
};

export interface MatchWorkspace {
  bankLines: BankLine[];
  ledger: LedgerEntry[];
  consumedBank: Set<string>;
  consumedLedger: Set<string>;
}

const within = (delta: number, total: number, tolPct: number) =>
  Math.abs(delta) <= Math.max(200, Math.abs(total) * tolPct);

const cardinalityOf = (nb: number, nl: number): MatchDecision["cardinality"] =>
  nb === 1 && nl === 1 ? "1:1" : nb === 1 ? "1:many" : nl === 1 ? "many:1" : "many:many";

/**
 * Apply one matching rule to one bank line. Returns null if the rule does not
 * fire or its strategy cannot balance within tolerance - a rule that cannot
 * close a line cleanly must hand it to a human rather than guess.
 */
export function applyMatchingRule(rule: Rule, bank: BankLine, ws: MatchWorkspace): MatchDecision | null {
  if (rule.action.type !== "match") return null;
  if (!evaluate(rule.predicate, { description: bank.description, amountCents: bank.amountCents })) return null;

  const { vendorName, strategy, deltaReason, tolerancePct } = rule.action;
  const avail = ws.ledger.filter((e) => !ws.consumedLedger.has(e.externalId) && daysBetween(e.entryDate, bank.postedDate) <= 12);

  const decide = (bankIds: string[], entries: LedgerEntry[], bankTotal: number): MatchDecision | null => {
    const led = entries.reduce((s, e) => s + e.amountCents, 0);
    const delta = led + bankTotal;                       // debit-positive: they should cancel
    if (!within(delta, bankTotal, tolerancePct)) return null;
    return {
      bankExternalIds: bankIds,
      ledgerExternalIds: entries.map((e) => e.externalId),
      cardinality: cardinalityOf(bankIds.length, entries.length),
      amountDeltaCents: delta,
      deltaReason: delta === 0 ? null : (deltaReason as DeltaReason | null),
      confidence: 0.98,
      decidedBy: "rule",
      ruleId: rule.id,
      reasoning: `Rule "${rule.name}" (${strategy})`,
    };
  };

  if (strategy === "same_day_settlement") {
    const sameDay = avail.filter((e) => e.entryDate === bank.postedDate && (e.source === "ar" || e.source === "bank_fee" || e.source === "payroll"));
    return decide([bank.externalId], sameDay, bank.amountCents);
  }

  const mine = avail.filter((e) => e.vendorName && norm(e.vendorName) === norm(vendorName));

  if (strategy === "installments") {
    const sibling = ws.bankLines.find(
      (b) => b.externalId !== bank.externalId && !ws.consumedBank.has(b.externalId) &&
             evaluate(rule.predicate, { description: b.description, amountCents: b.amountCents }) &&
             daysBetween(b.postedDate, bank.postedDate) <= 12,
    );
    for (const group of groupByMemo(mine)) {
      if (sibling) {
        const d = decide([bank.externalId, sibling.externalId], group, bank.amountCents + sibling.amountCents);
        if (d) return d;
      }
      const single = decide([bank.externalId], group, bank.amountCents);
      if (single) return single;
    }
    return null;
  }

  // by_invoice
  for (const group of groupByMemo(mine)) {
    const d = decide([bank.externalId], group, bank.amountCents);
    if (d) return d;
  }
  return null;
}

export function applyMatchingRules(rb: Rulebook, bank: BankLine, ws: MatchWorkspace): MatchDecision | null {
  for (const rule of activeRules(rb, "matching")) {
    const d = applyMatchingRule(rule, bank, ws);
    if (d) return d;
  }
  return null;
}

export function consume(ws: MatchWorkspace, d: MatchDecision) {
  d.bankExternalIds.forEach((id) => ws.consumedBank.add(id));
  d.ledgerExternalIds.forEach((id) => ws.consumedLedger.add(id));
}

// ── accrual completeness ─────────────────────────────────────────────────────

export function applyAccrualRules(
  rb: Rulebook,
  vendorName: string,
  history: number[],           // amounts from prior periods, most recent last
  billedThisPeriod: boolean,
): AccrualProposal | null {
  if (billedThisPeriod || history.length === 0) return null;
  for (const rule of activeRules(rb, "accrual")) {
    if (rule.action.type !== "accrue") continue;
    if (!evaluate(rule.predicate, { vendorName, description: vendorName })) continue;
    const basis = rule.action.basis;
    const tail = basis === "last_period" ? history.slice(-1) : history.slice(-3);
    const amount = Math.round(tail.reduce((a, b) => a + b, 0) / tail.length);
    return {
      vendorName, glCode: rule.action.glCode, amountCents: amount,
      confidence: 0.94, decidedBy: "rule", ruleId: rule.id,
      reasoning: `Rule "${rule.name}" - ${basis.replace(/_/g, " ")} of ${tail.length} prior period(s)`,
    };
  }
  return null;
}

// ── backtest ─────────────────────────────────────────────────────────────────

export interface BacktestCase { periodCode: string; subjectRef: string; ctx: PredicateContext; expected: string }

/**
 * Replay a proposed rule against every closed period. A rule is never adopted
 * on a promise - the controller sees what it would have changed, and what it
 * would have broken, before it is allowed to be active.
 */
export function backtestRule(rule: Rule, cases: BacktestCase[]): BacktestResult {
  const regressions: BacktestResult["regressions"] = [];
  let fired = 0, correct = 0;
  const periods = new Set<string>();

  for (const c of cases) {
    periods.add(c.periodCode);
    if (!evaluate(rule.predicate, c.ctx)) continue;
    fired++;
    const said = describeAction(rule);
    if (said === c.expected) correct++;
    else regressions.push({ periodCode: c.periodCode, subjectRef: c.subjectRef, expected: c.expected, ruleSaid: said });
  }

  return {
    periodsReplayed: [...periods].sort(),
    wouldHaveFired: fired,
    wouldHaveBeenCorrect: correct,
    wouldHaveBeenWrong: fired - correct,
    regressions: regressions.slice(0, 20),
    precision: fired === 0 ? 0 : correct / fired,
  };
}

export function describeAction(rule: Rule): string {
  const a = rule.action;
  switch (a.type) {
    case "code": {
      const split = Object.entries(a.deptSplit).sort(([x], [y]) => x.localeCompare(y))
        .map(([d, w]) => `${d}:${Math.round(w * 100)}`).join("/");
      return `${a.glCode}|${split}`;
    }
    case "match":         return `match:${a.vendorName}:${a.strategy}`;
    case "accrue":        return `accrue:${a.glCode}:${a.basis}`;
    case "always_review": return `review:${a.reason}`;
  }
}

export const emptyRulebook = (): Rulebook => ({ version: 0, rules: [] });
