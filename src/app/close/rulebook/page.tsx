import { Badge, Panel } from "@/components/kit";
import { EmptyRun, Shell } from "@/components/shell";
import { ProvenanceBanner } from "@/components/provenance";
import { latestReport } from "@/lib/report";
import type { Rule } from "@/lib/agent/types";

export const dynamic = "force-dynamic";

const OP: Record<string, string> = {
  vendor_is: "vendor is", desc_contains: "description contains", desc_matches: "description matches",
  amount_gte: "amount ≥", amount_lte: "amount ≤", source_is: "source is", cadence_is: "cadence is",
};

function ActionSummary({ rule }: { rule: Rule }) {
  const a = rule.action;
  if (a.type === "code") {
    return (
      <span className="nums">
        code to <span className="text-ink">{a.glCode}</span>
        <span className="text-ink-tertiary"> · {Object.entries(a.deptSplit).map(([d, w]) => `${d} ${Math.round(w * 100)}%`).join(" / ")}</span>
      </span>
    );
  }
  if (a.type === "match") {
    return <span>match against <span className="text-ink">{a.vendorName}</span> <span className="text-ink-tertiary">via {a.strategy.replace(/_/g, " ")}{a.deltaReason ? `, residual is ${a.deltaReason}` : ""}</span></span>;
  }
  if (a.type === "accrue") return <span>accrue to <span className="text-ink nums">{a.glCode}</span> <span className="text-ink-tertiary">at {a.basis.replace(/_/g, " ")}</span></span>;
  return <span>always route to a human <span className="text-ink-tertiary">— {a.reason}</span></span>;
}

export default async function RulebookPage() {
  const report = await latestReport();
  if (!report) return <Shell active="/close/rulebook"><EmptyRun /></Shell>;

  const rules = report.rulebook;
  const proposed = report.periods.flatMap((p) => p.proposals);
  const rejected = proposed.filter((p) => !p.adopted);

  return (
    <Shell active="/close/rulebook">
      <ProvenanceBanner report={report} />
      <div className="mb-6">
        <div className="eyebrow mb-2">Rulebook · the weights</div>
        <h1 className="headline text-ink">{rules.length} rules, learned from corrections</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-subtle">
          Each of these was distilled from at least two distinct human corrections, replayed
          against every closed period, and only then activated. They execute with zero model
          calls - which is why the close gets cheaper rather than more expensive as the agent
          learns more.
        </p>
      </div>

      {rules.length === 0 ? (
        <Panel className="p-8 text-center">
          <h2 className="card-title text-ink">Nothing learned yet</h2>
          <p className="mt-2 text-[13px] text-ink-subtle">The first close has no precedent to distil. Rules appear after the first gradient step.</p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {rules.map((r) => (
            <Panel key={r.id} className="p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] text-ink-tertiary">{r.id}</span>
                <h3 className="text-[15px] font-medium text-ink">{r.name}</h3>
                <Badge kind="rule">{r.kind}</Badge>
                <Badge kind={r.status === "active" ? "good" : "neutral"}>{r.status}</Badge>
              </div>

              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[var(--radius-md)] border border-hairline bg-surface-1 p-3">
                  <div className="eyebrow mb-1.5">When</div>
                  <ul className="space-y-1 text-[13px] text-ink-muted">
                    {r.predicate.map((p, i) => (
                      <li key={i} className="nums">
                        {OP[p.op] ?? p.op} <span className="text-ink">{String(p.value)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-[var(--radius-md)] border border-hairline bg-surface-1 p-3">
                  <div className="eyebrow mb-1.5">Then</div>
                  <div className="text-[13px] text-ink-muted"><ActionSummary rule={r} /></div>
                </div>
              </div>

              {r.backtest ? (
                <div className="mb-4">
                  <div className="eyebrow mb-2">
                    Backtest · replayed against {r.backtest.periodsReplayed.join(", ") || "no prior period"}
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-[13px] nums">
                    <span className="text-ink-muted">fired <span className="text-ink">{r.backtest.wouldHaveFired}×</span></span>
                    <span className="text-ink-muted">correct <span className="text-[var(--success)]">{r.backtest.wouldHaveBeenCorrect}</span></span>
                    <span className="text-ink-muted">wrong <span className={r.backtest.wouldHaveBeenWrong ? "text-[var(--danger)]" : "text-ink-tertiary"}>{r.backtest.wouldHaveBeenWrong}</span></span>
                    <span className="text-ink-muted">precision <span className="text-ink">{(r.backtest.precision * 100).toFixed(1)}%</span></span>
                  </div>
                  {r.backtest.regressions.length > 0 ? (
                    <div className="mt-2 rounded-[var(--radius-md)] border border-[var(--danger)]/25 bg-[var(--danger)]/6 p-2.5 text-[12px] text-ink-muted">
                      <span className="text-[var(--danger)]">Would have broken:</span>{" "}
                      {r.backtest.regressions.slice(0, 3).map((g) => `${g.subjectRef} (wanted ${g.expected})`).join("; ")}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div>
                <div className="eyebrow mb-2">Evidence · {r.evidence.length} corrections</div>
                <ul className="space-y-1.5">
                  {r.evidence.map((e) => (
                    <li key={e.correctionId} className="rounded-[var(--radius-sm)] border-l-2 border-[var(--primary)]/40 bg-surface-1 py-1.5 pl-3 pr-2 text-[12px] leading-snug text-ink-muted">
                      <span className="font-mono text-ink-tertiary">{e.periodCode} · {e.subjectRef}</span>
                      <div className="mt-0.5">{e.quote}</div>
                    </li>
                  ))}
                </ul>
              </div>
            </Panel>
          ))}
        </div>
      )}

      {rejected.length > 0 ? (
        <div className="mt-8">
          <h2 className="mb-1 text-[15px] font-medium text-ink">{rejected.length} proposals the gate rejected</h2>
          <p className="mb-3 text-[13px] text-ink-subtle">
            Proposing a rule is not adopting one. These failed the backtest or the evidence bar and never reached the books.
          </p>
          <Panel className="divide-y divide-[var(--hairline)]">
            {rejected.map((p, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                <span className="text-ink-muted">{p.name}</span>
                <span className="nums flex items-center gap-4 text-[12px] text-ink-tertiary">
                  <span>{p.kind}</span>
                  <span>fired {p.fired}×</span>
                  <span>precision {(p.precision * 100).toFixed(0)}%</span>
                  <span>{p.evidence} evidence</span>
                </span>
              </div>
            ))}
          </Panel>
        </div>
      ) : null}
    </Shell>
  );
}
