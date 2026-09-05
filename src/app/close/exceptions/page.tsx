import { Badge, Money, Panel } from "@/components/kit";
import { EmptyRun, Shell } from "@/components/shell";
import { ProvenanceBanner } from "@/components/provenance";
import { latestReport } from "@/lib/report";
import type { Exception } from "@/lib/agent/types";

export const dynamic = "force-dynamic";

const CAUSE: Record<string, { badge: string; label: string; why: string }> = {
  over_materiality:      { badge: "warn",  label: "Over materiality", why: "Above the threshold, so a human reviews it however confident the agent is." },
  low_confidence:        { badge: "bad",   label: "Low confidence",   why: "The agent declined to assert this one. That is the system working." },
  policy_requires_human: { badge: "human", label: "Policy",           why: "A standing rule sends this class of item to a person every time." },
  no_candidate:          { badge: "neutral", label: "No match found", why: "On the bank, nothing in the ledger explains it. Usually a timing difference." },
  ambiguous_candidates:  { badge: "warn",  label: "Ambiguous",        why: "More than one credible answer. Forcing a pick here would be guessing." },
};

function Proposal({ ex }: { ex: Exception }) {
  const p = ex.proposal as Record<string, unknown>;
  if (!p || Object.keys(p).length === 0) return <span className="text-ink-tertiary">no proposal</span>;
  if (typeof p.glCode === "string") {
    const split = (p.deptSplit ?? {}) as Record<string, number>;
    return (
      <span className="nums text-ink-muted">
        {p.glCode}
        {Object.keys(split).length ? (
          <span className="text-ink-tertiary"> · {Object.entries(split).map(([d, w]) => `${d} ${Math.round(w * 100)}%`).join(" / ")}</span>
        ) : null}
      </span>
    );
  }
  if (typeof p.suggestedCents === "number") {
    return <span className="text-ink-muted">accrue <Money cents={p.suggestedCents} /> <span className="text-ink-tertiary">({String(p.basis)})</span></span>;
  }
  if (typeof p.description === "string") {
    return <span className="text-ink-muted">{p.description}{p.why ? <span className="text-ink-tertiary"> — {String(p.why)}</span> : null}</span>;
  }
  return <span className="text-ink-tertiary">match proposed</span>;
}

export default async function ExceptionsPage() {
  const report = await latestReport();
  if (!report) return <Shell active="/close/exceptions"><EmptyRun /></Shell>;

  const last = report.periods[report.periods.length - 1];
  const first = report.periods[0];
  const queue = last.exceptions ?? [];
  const byCause = queue.reduce<Record<string, number>>((a, e) => ({ ...a, [e.cause]: (a[e.cause] ?? 0) + 1 }), {});

  return (
    <Shell active="/close/exceptions">
      <ProvenanceBanner report={report} />
      <div className="mb-6">
        <div className="eyebrow mb-2">Exception queue · {last.period}</div>
        <h1 className="headline text-ink">{queue.length} items need judgment</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-subtle">
          Down from {first.exceptions?.length ?? first.stats.exceptionsOpened} in {first.period}. An exception is not an error - it is the
          agent correctly declining to assert something. Each resolution here becomes
          evidence, and two matching resolutions become a rule.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {Object.entries(byCause).map(([cause, n]) => (
          <Badge key={cause} kind={CAUSE[cause]?.badge ?? "neutral"}>
            {CAUSE[cause]?.label ?? cause} · {n}
          </Badge>
        ))}
      </div>

      {queue.length === 0 ? (
        <Panel className="p-8 text-center">
          <h2 className="card-title text-ink">Queue is clear</h2>
          <p className="mt-2 text-[13px] text-ink-subtle">Everything this period was settled by a rule or cleared within policy.</p>
        </Panel>
      ) : (
        <div className="space-y-2">
          {queue.map((ex) => {
            const c = CAUSE[ex.cause] ?? CAUSE.no_candidate;
            return (
              <Panel key={ex.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[12px] text-ink">{ex.subjectRef}</span>
                      <Badge kind={c.badge}>{c.label}</Badge>
                      <span className="text-[12px] text-ink-tertiary">{ex.subjectType.replace("_", " ")}</span>
                      {ex.confidence !== null ? (
                        <span className="nums text-[12px] text-ink-tertiary">confidence {(ex.confidence * 100).toFixed(0)}%</span>
                      ) : null}
                    </div>
                    <div className="text-[13px]"><span className="text-ink-tertiary">agent proposes </span><Proposal ex={ex} /></div>
                    <p className="mt-1.5 text-[12px] leading-snug text-ink-tertiary">{c.why}</p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Money cents={ex.amountCents} className="text-[15px] font-medium" />
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {ex.options.slice(0, 2).map((o, i) => (
                        <span
                          key={i}
                          className={`rounded-[var(--radius-sm)] border px-2 py-1 text-[12px] ${
                            i === 0 ? "border-[var(--primary)]/40 bg-[var(--primary)]/10 text-[#a8b0f5]" : "border-hairline bg-surface-2 text-ink-subtle"
                          }`}
                        >
                          {o.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
