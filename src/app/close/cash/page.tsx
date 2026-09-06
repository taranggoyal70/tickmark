import { Money, Panel } from "@/components/kit";
import { Shell } from "@/components/shell";
import { listEntitiesWithPeriods } from "@/lib/agent/run-period";
import { cashView } from "@/lib/close/cash";
import { queueEnabled } from "@/lib/store/queue";

export const dynamic = "force-dynamic";

export default async function CashPage() {
  const entities = queueEnabled() ? await listEntitiesWithPeriods().catch(() => []) : [];
  const view = entities.length ? await cashView(entities[0].name) : null;

  if (!view) {
    return (
      <Shell active="/close/cash">
        <Panel className="p-8 text-center">
          <h2 className="card-title text-ink">No books yet</h2>
          <p className="mt-2 text-[13px] text-ink-subtle">Import a period to see the cash position.</p>
        </Panel>
      </Shell>
    );
  }

  const latest = view.actuals[view.actuals.length - 1];
  const burn = view.actuals.slice(-3).reduce((s, a) => s + a.netCents, 0) / Math.min(3, view.actuals.length);

  return (
    <Shell active="/close/cash">
      <div className="mb-6 max-w-2xl">
        <div className="eyebrow mb-2">Cash · {view.entity}</div>
        <h1 className="headline text-ink">Position and the month ahead</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-subtle">
          Actuals come from the bank statement, not from the ledger, because the bank is the source
          of truth for cash. Every projected line says what it rests on — a vendor seen once is
          reported as an anecdote rather than averaged quietly into the total.
        </p>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        {[
          { l: "Net movement, latest period", v: <Money cents={latest.netCents} />, s: latest.periodCode },
          { l: "Average monthly burn", v: <Money cents={Math.round(burn)} />, s: `last ${Math.min(3, view.actuals.length)} periods` },
          { l: "Already committed", v: <Money cents={view.committedOutflowCents} />, s: "invoiced and unpaid" },
        ].map((s) => (
          <Panel key={s.l} className="p-5">
            <div className="eyebrow mb-1.5">{s.l}</div>
            <div className="nums text-[24px] font-medium text-ink">{s.v}</div>
            <div className="mt-1 text-[12px] text-ink-tertiary">{s.s}</div>
          </Panel>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-5">
          <h3 className="mb-1 text-[15px] font-medium text-ink">Cash movement by period</h3>
          <p className="mb-3 text-[12px] text-ink-subtle">From the statement. Position is cumulative across imported periods.</p>
          <table className="w-full text-[13px] nums">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-tertiary">
                <th className="pb-2 font-medium">Period</th>
                <th className="pb-2 text-right font-medium">Received</th>
                <th className="pb-2 text-right font-medium">Paid out</th>
                <th className="pb-2 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody>
              {view.actuals.map((a) => (
                <tr key={a.periodCode} className="border-t border-[var(--hairline)]">
                  <td className="py-2 text-ink-muted">{a.periodCode}</td>
                  <td className="py-2 text-right"><Money cents={a.inflowCents} /></td>
                  <td className="py-2 text-right"><Money cents={a.outflowCents} /></td>
                  <td className="py-2 text-right font-medium"><Money cents={a.netCents} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel className="p-5">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[15px] font-medium text-ink">Expected in {view.forecastPeriod}</h3>
            <span className="nums text-[14px] font-medium text-ink">
              net <Money cents={view.projectedNetCents} />
            </span>
          </div>
          <p className="mb-3 text-[12px] text-ink-subtle">
            {view.thinEvidenceCount > 0
              ? `${view.thinEvidenceCount} lines rest on a single observation and are marked.`
              : "Every line rests on at least two prior periods."}
          </p>
          <div className="max-h-[22rem] space-y-1.5 overflow-y-auto">
            {[...view.expectedInflows, ...view.expectedOutflows].map((l, i) => (
              <div key={i} className="flex flex-wrap items-baseline justify-between gap-2 rounded-[var(--radius-sm)] border border-hairline bg-surface-1 px-2.5 py-2">
                <div className="min-w-0">
                  <div className="text-[13px] text-ink">{l.label}</div>
                  <div className="text-[11px] leading-snug text-ink-tertiary">
                    {l.basis}
                    {l.certain ? " · committed" : l.observations < 2 ? " · thin evidence" : ""}
                  </div>
                </div>
                <span className="nums text-[13px] font-medium"><Money cents={l.amountCents} /></span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </Shell>
  );
}
