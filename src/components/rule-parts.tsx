import type { Rule } from "@/lib/agent/types";

/** Predicate operators as a controller would say them. */
export const OP: Record<string, string> = {
  vendor_is: "vendor is", desc_contains: "description contains", desc_matches: "description matches",
  amount_gte: "amount ≥", amount_lte: "amount ≤", source_is: "source is", cadence_is: "cadence is",
};

/** What a rule does, in one line. */
export function ActionSummary({ rule }: { rule: Rule }) {
  const a = rule.action;
  if (a.type === "code") {
    return (
      <span className="nums">
        code to <span className="text-ink">{a.glCode}</span>
        <span className="text-muted"> · {Object.entries(a.deptSplit).map(([d, w]) => `${d} ${Math.round(w * 100)}%`).join(" / ")}</span>
      </span>
    );
  }
  if (a.type === "match") {
    return <span>match against <span className="text-ink">{a.vendorName}</span> <span className="text-muted">via {a.strategy.replace(/_/g, " ")}{a.deltaReason ? `, residual is ${a.deltaReason}` : ""}</span></span>;
  }
  if (a.type === "accrue") return <span>accrue to <span className="text-ink nums">{a.glCode}</span> <span className="text-muted">at {a.basis.replace(/_/g, " ")}</span></span>;
  return <span>always route to a human <span className="text-muted">({a.reason})</span></span>;
}
