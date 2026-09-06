import { db } from "../ingest/ingest";
import { applyMatchingRule, evaluate, type MatchWorkspace } from "./rules";
import type { BacktestResult, BankLine, LedgerEntry, Rule } from "./types";

/**
 * Replay a proposed rule against the entity's own closed history.
 *
 * The earlier implementation backtested against the bundled fixture, which made
 * the product unable to work on anyone else's books. This reads only what has
 * actually been ingested, so a rule is judged on the customer's history or not
 * adopted at all.
 */

const splitKeyOf = (weights: Record<string, number>) =>
  Object.entries(weights).filter(([, w]) => w > 0.02).sort(([a], [b]) => a.localeCompare(b))
    .map(([d, w]) => `${d}:${Math.round(w * 100)}`).join("/");

interface HistoricalInvoice {
  invoiceNumber: string; vendor: string; amountCents: number; description: string;
  periodCode: string; glCode: string | null; deptSplit: Record<string, number>;
}

/** Invoices from periods before `beforeCode`, with the coding a human accepted. */
async function codedHistory(entityId: string, beforeCode: string): Promise<HistoricalInvoice[]> {
  const c = db();
  const { data } = await c
    .from("ap_invoices")
    .select("invoice_number, amount_cents, description, gl_account_id, period_id, vendor_id, periods(code), vendors(name), gl_accounts(code)")
    .eq("entity_id", entityId);
  if (!data?.length) return [];

  // department weights live on the ledger side, where the split was actually posted
  const { data: led } = await c
    .from("ledger_entries")
    .select("memo, amount_cents, departments(code)")
    .eq("entity_id", entityId)
    .eq("source", "ap");
  const byInvoice = new Map<string, { dept: string; amount: number }[]>();
  for (const l of (led ?? []) as unknown as Record<string, unknown>[]) {
    const memo = String(l.memo ?? "");
    const dept = (l.departments as { code?: string } | null)?.code;
    if (!dept) continue;
    const key = memo.split(" ").pop() ?? "";
    if (!key) continue;
    (byInvoice.get(key) ?? byInvoice.set(key, []).get(key)!).push({ dept, amount: Number(l.amount_cents) });
  }

  return (data as unknown as Record<string, unknown>[])
    .map((r) => {
      const code = String(r.invoice_number);
      const parts = byInvoice.get(code) ?? [];
      const total = parts.reduce((s, p) => s + Math.abs(p.amount), 0) || 1;
      const split: Record<string, number> = {};
      for (const p of parts) split[p.dept] = Math.round((Math.abs(p.amount) / total) * 1000) / 1000;
      return {
        invoiceNumber: code,
        vendor: (r.vendors as { name?: string } | null)?.name ?? "",
        amountCents: Number(r.amount_cents),
        description: String(r.description ?? ""),
        periodCode: (r.periods as { code?: string } | null)?.code ?? "",
        glCode: (r.gl_accounts as { code?: string } | null)?.code ?? null,
        deptSplit: split,
      };
    })
    .filter((i) => i.periodCode && i.periodCode < beforeCode && i.glCode);
}

async function bankHistory(entityId: string, beforeCode: string) {
  const c = db();
  const [{ data: bank }, { data: led }] = await Promise.all([
    c.from("bank_lines").select("external_id, posted_date, description, amount_cents, currency, periods(code)").eq("entity_id", entityId),
    c.from("ledger_entries").select("external_id, entry_date, amount_cents, memo, source, periods(code), vendors(name), gl_accounts(code), departments(code)").eq("entity_id", entityId),
  ]);
  const inWindow = (r: Record<string, unknown>) => {
    const code = (r.periods as { code?: string } | null)?.code ?? "";
    return code && code < beforeCode;
  };
  const bankLines: BankLine[] = ((bank ?? []) as unknown as Record<string, unknown>[]).filter(inWindow).map((r) => ({
    externalId: String(r.external_id), postedDate: String(r.posted_date),
    description: String(r.description), amountCents: Number(r.amount_cents), currency: String(r.currency),
  }));
  const ledger: LedgerEntry[] = ((led ?? []) as unknown as Record<string, unknown>[]).filter(inWindow).map((r) => ({
    externalId: String(r.external_id), entryDate: String(r.entry_date),
    glCode: (r.gl_accounts as { code?: string } | null)?.code ?? null,
    deptCode: (r.departments as { code?: string } | null)?.code ?? null,
    vendorName: (r.vendors as { name?: string } | null)?.name ?? null,
    amountCents: Number(r.amount_cents), memo: String(r.memo ?? ""), source: String(r.source ?? "manual"),
  }));
  return { bankLines, ledger };
}

export async function backtestAgainstHistory(
  rule: Rule, entityId: string, beforeCode: string,
): Promise<BacktestResult> {
  const regressions: BacktestResult["regressions"] = [];
  const periods = new Set<string>();
  let fired = 0, correct = 0;

  if (rule.kind === "coding" && rule.action.type === "code") {
    const want = `${rule.action.glCode}|${splitKeyOf(rule.action.deptSplit)}`;
    for (const inv of await codedHistory(entityId, beforeCode)) {
      periods.add(inv.periodCode);
      if (!evaluate(rule.predicate, {
        vendorName: inv.vendor, description: `${inv.vendor} ${inv.description}`, amountCents: inv.amountCents,
      })) continue;
      fired++;
      const actual = `${inv.glCode}|${splitKeyOf(inv.deptSplit)}`;
      if (actual === want) correct++;
      else regressions.push({ periodCode: inv.periodCode, subjectRef: inv.invoiceNumber, expected: actual, ruleSaid: want });
    }
  } else if (rule.kind === "matching" && rule.action.type === "match") {
    const { bankLines, ledger } = await bankHistory(entityId, beforeCode);
    const ws: MatchWorkspace = { bankLines, ledger, consumedBank: new Set(), consumedLedger: new Set() };
    for (const b of bankLines) {
      if (ws.consumedBank.has(b.externalId)) continue;
      const d = applyMatchingRule(rule, b, ws);
      if (!d) continue;
      fired++;
      // a match that balances is its own evidence; one that does not is a regression
      const tolerance = Math.max(200, Math.abs(b.amountCents) * 0.03);
      if (Math.abs(d.amountDeltaCents) <= tolerance) {
        correct++;
        d.bankExternalIds.forEach((x) => ws.consumedBank.add(x));
        d.ledgerExternalIds.forEach((x) => ws.consumedLedger.add(x));
      } else {
        regressions.push({
          periodCode: b.postedDate.slice(0, 7), subjectRef: b.externalId,
          expected: "a balanced match", ruleSaid: `off by ${(d.amountDeltaCents / 100).toFixed(2)}`,
        });
      }
      periods.add(b.postedDate.slice(0, 7));
    }
  }

  return {
    periodsReplayed: [...periods].sort(),
    wouldHaveFired: fired, wouldHaveBeenCorrect: correct, wouldHaveBeenWrong: fired - correct,
    regressions: regressions.slice(0, 20),
    precision: fired === 0 ? 0 : correct / fired,
  };
}

/** The coding a vendor's own history supports, or null when there is no precedent. */
export async function codingPrecedent(entityId: string, vendor: string, beforeCode: string) {
  const history = (await codedHistory(entityId, beforeCode)).filter((i) => i.vendor === vendor);
  if (!history.length) return null;
  const tally = new Map<string, { n: number; glCode: string; deptSplit: Record<string, number> }>();
  for (const i of history) {
    const k = `${i.glCode}|${splitKeyOf(i.deptSplit)}`;
    const e = tally.get(k);
    if (e) e.n++;
    else tally.set(k, { n: 1, glCode: i.glCode!, deptSplit: i.deptSplit });
  }
  return [...tally.values()].sort((a, b) => b.n - a.n)[0];
}
