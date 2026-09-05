/**
 * The human gate, simulated.
 *
 * In production a controller works the exception queue. In the harness the
 * ground truth stands in for them, because a controller *is* the ground truth -
 * their judgment is what the agent is trying to learn. Note what this does NOT
 * do: it never reviews a line the agent auto-cleared. Nobody looks at those.
 * That is precisely why auto-clear precision is the metric that must not slip.
 */
import type { GeneratedPeriod } from "../seed/generate";
import { splitKey } from "./close";
import type { CorrectionRecord } from "./gradient";
import type { CloseRunResult } from "./types";

/** Observed median handling time for one exception in a real close. */
const SECONDS_PER_EXCEPTION = 45;

export function controllerReview(period: GeneratedPeriod, run: CloseRunResult): CorrectionRecord[] {
  const out: CorrectionRecord[] = [];
  let n = 0;
  const id = () => `COR-${period.code}-${String(++n).padStart(3, "0")}`;

  for (const ex of run.exceptions) {
    if (ex.subjectType === "ap_invoice") {
      const t = period.truth.coding[ex.subjectRef];
      if (!t) continue;
      const inv = period.apInvoices.find((i) => i.invoiceNumber === ex.subjectRef);
      const proposed = ex.proposal as { glCode?: string; deptSplit?: Record<string, number> } | undefined;
      const agentSaid = proposed?.glCode ? `${proposed.glCode}|${splitKey(proposed.deptSplit ?? {})}` : "(no proposal)";
      const humanSaid = `${t.glCode}|${splitKey(t.deptSplit)}`;
      out.push({
        id: id(), kind: "coding", period: period.code, subject: ex.subjectRef,
        vendor: inv?.vendorName ?? "", agentSaid, humanSaid,
        note: agentSaid === humanSaid ? "confirmed" : "recoded",
        glCode: t.glCode, deptSplit: t.deptSplit, amountCents: inv?.amountCents ?? 0,
      });
    } else if (ex.subjectType === "bank_line") {
      const truth = period.truth.matches.find((m) => m.bankExternalIds.includes(ex.subjectRef));
      const bank = period.bankLines.find((b) => b.externalId === ex.subjectRef);
      if (!truth) {
        // a genuine timing difference: the controller carries it forward, and
        // that is the correct answer, not a miss
        out.push({
          id: id(), kind: "matching", period: period.code, subject: ex.subjectRef,
          vendor: "", agentSaid: "unmatched", humanSaid: "timing difference - carry forward",
          note: "on the bank, not yet in the ledger", amountCents: bank?.amountCents ?? 0,
        });
        continue;
      }
      const led = truth.ledgerExternalIds
        .map((lid) => period.ledgerEntries.find((e) => e.externalId === lid))
        .filter(Boolean);
      const vendor = led.find((e) => e?.vendorName)?.vendorName ?? "";
      out.push({
        id: id(), kind: "matching", period: period.code, subject: ex.subjectRef,
        vendor,
        agentSaid: (ex.proposal as { why?: string })?.why ?? "unmatched",
        humanSaid: `${truth.cardinality} against ${truth.ledgerExternalIds.length} ledger line(s)${truth.deltaReason ? `, residual is ${truth.deltaReason}` : ""}`,
        note: truth.deltaReason ? `difference is ${truth.deltaReason}, not an error` : "clean tie-out",
        amountCents: bank?.amountCents ?? 0,
      });
    } else if (ex.subjectType === "accrual") {
      const t = period.truth.expectedAccruals.find((a) => a.vendorName === ex.subjectRef);
      out.push({
        id: id(), kind: "accrual", period: period.code, subject: ex.subjectRef,
        vendor: ex.subjectRef,
        agentSaid: `suggested ${(ex.amountCents / 100).toFixed(2)}`,
        humanSaid: t ? `accrue ${(t.amountCents / 100).toFixed(2)} to ${t.glCode}` : "no accrual",
        note: t ? "recurring vendor did not invoice before cut-off" : "service ended",
        glCode: t?.glCode, amountCents: t?.amountCents ?? 0,
      });
    }
  }
  return out;
}

export const touchSeconds = (corrections: number) => corrections * SECONDS_PER_EXCEPTION;
