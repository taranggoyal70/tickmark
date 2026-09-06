import { Money, Panel } from "@/components/kit";
import { Shell } from "@/components/shell";
import { listEntitiesWithPeriods } from "@/lib/agent/run-period";
import { reconcile, type ReconcilingItem } from "@/lib/close/reconciliation";
import { queueEnabled } from "@/lib/store/queue";

export const dynamic = "force-dynamic";

function ItemTable({ title, note, items }: { title: string; note: string; items: ReconcilingItem[] }) {
  const total = items.reduce((s, i) => s + i.amountCents, 0);
  return (
    <Panel className="p-5">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-medium text-ink">{title}</h3>
        <span className="nums text-[14px] font-medium text-ink"><Money cents={total} /></span>
      </div>
      <p className="mb-3 text-[12px] text-ink-subtle">{note}</p>
      {items.length === 0 ? (
        <p className="text-[13px] text-[var(--success)]">Nothing outstanding.</p>
      ) : (
        <div className="max-h-[19rem] overflow-y-auto">
          <table className="w-full text-[13px] nums">
            <tbody>
              {items.map((i) => (
                <tr key={i.ref} className="border-t border-[var(--hairline)] first:border-0">
                  <td className="py-1.5 pr-2 font-mono text-[11px] text-ink-tertiary">{i.date}</td>
                  <td className="py-1.5 pr-2 text-ink-muted">{i.description.slice(0, 46)}</td>
                  <td className="py-1.5 text-right"><Money cents={i.amountCents} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export default async function ReconciliationPage(props: PageProps<"/close/reconciliation">) {
  const entities = queueEnabled() ? await listEntitiesWithPeriods().catch(() => []) : [];
  if (!entities.length) {
    return (
      <Shell active="/close/reconciliation">
        <Panel className="p-8 text-center">
          <h2 className="card-title text-ink">No books yet</h2>
          <p className="mt-2 text-[13px] text-ink-subtle">Import a period first.</p>
        </Panel>
      </Shell>
    );
  }

  const sp = await props.searchParams;
  const entity = entities[0];
  const period = typeof sp?.period === "string" && entity.periods.includes(sp.period)
    ? sp.period
    : entity.periods[entity.periods.length - 1];
  const rec = await reconcile(entity.name, period);

  return (
    <Shell active="/close/reconciliation">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-2">Bank reconciliation · {entity.name}</div>
          <h1 className="headline text-ink">{period}</h1>
        </div>
        <nav className="flex flex-wrap gap-1.5">
          {entity.periods.map((p) => (
            <a key={p} href={`/close/reconciliation?period=${p}`}
              className={`focus-ring nums rounded-[var(--radius-sm)] border px-2.5 py-1 text-[12px] ${
                p === period ? "border-[var(--primary)]/40 bg-[var(--primary)]/8 text-[var(--primary-hover)]"
                             : "border-hairline bg-surface-1 text-ink-subtle hover:bg-surface-3"}`}>
              {p}
            </a>
          ))}
        </nav>
      </div>

      {!rec ? (
        <Panel className="p-8 text-center"><p className="text-[13px] text-ink-subtle">Nothing to reconcile for {period}.</p></Panel>
      ) : (
        <>
          <Panel className="mb-4 p-5">
            <div className="grid gap-4 sm:grid-cols-4">
              {[
                { l: "Statement lines", v: String(rec.bankLineCount) },
                { l: "Explained", v: `${rec.matchedBankCount} of ${rec.bankLineCount}` },
                { l: "Movement on statement", v: <Money cents={rec.bankMovementCents} /> },
                { l: "Unexplained difference", v: <Money cents={rec.unexplainedCents} /> },
              ].map((s) => (
                <div key={s.l}>
                  <div className="eyebrow mb-1.5">{s.l}</div>
                  <div className="nums text-[20px] font-medium text-ink">{s.v}</div>
                </div>
              ))}
            </div>
            <p className={`mt-4 text-[13px] ${rec.tiesOut ? "text-[var(--success)]" : "text-ink-muted"}`}>
              {rec.tiesOut
                ? "Reconciled. Every line on the statement is explained by the ledger."
                : `Not yet reconciled — ${rec.outstanding.length} statement lines and ${rec.inLedgerNotOnBank.length} ledger entries are still unexplained. They are listed below rather than summarised away.`}
            </p>
          </Panel>

          {rec.explainedDifferences.length ? (
            <Panel className="mb-4 p-5">
              <h3 className="mb-1 text-[15px] font-medium text-ink">Differences that are explained</h3>
              <p className="mb-3 text-[12px] text-ink-subtle">
                A residual is not automatically an error. These were matched and the difference was named.
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {rec.explainedDifferences.map((d) => (
                  <span key={d.reason} className="nums text-[13px] text-ink-muted">
                    {d.reason.replace(/_/g, " ")} · {d.count} · <Money cents={d.amountCents} />
                  </span>
                ))}
              </div>
            </Panel>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <ItemTable
              title="Outstanding on the statement"
              note="On the bank, nothing in the ledger explains it yet. Usually a timing difference."
              items={rec.outstanding}
            />
            <ItemTable
              title="In the ledger, not on the statement"
              note="Posted to the books but not yet cleared the bank."
              items={rec.inLedgerNotOnBank}
            />
          </div>
        </>
      )}
    </Shell>
  );
}
