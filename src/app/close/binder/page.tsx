import { Badge, Money, Panel } from "@/components/kit";
import { Shell } from "@/components/shell";
import { listEntitiesWithPeriods } from "@/lib/agent/run-period";
import { buildBinder } from "@/lib/close/binder";
import { queueEnabled } from "@/lib/store/queue";

export const dynamic = "force-dynamic";

export default async function BinderPage(props: PageProps<"/close/binder">) {
  const entities = queueEnabled() ? await listEntitiesWithPeriods().catch(() => []) : [];
  if (!entities.length) {
    return (
      <Shell active="/close/binder">
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
    ? sp.period : entity.periods[entity.periods.length - 1];
  const b = await buildBinder(entity.name, period);

  const q = `entity=${encodeURIComponent(entity.name)}&period=${period}`;

  return (
    <Shell active="/close/binder">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <div className="eyebrow mb-2">Close binder · {entity.name}</div>
          <h1 className="headline text-ink">Audit support for {period}</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-subtle">
            When an auditor asks who checked something, when, and on what basis, the answer should
            be a file — not a week of reconstructing it. Everything here is read back from the
            ledger; nothing is recomputed for the report.
          </p>
        </div>
        <nav className="flex flex-wrap gap-1.5">
          {entity.periods.map((p) => (
            <a key={p} href={`/close/binder?period=${p}`}
              className={`focus-ring nums rounded-[var(--radius-sm)] border px-2.5 py-1 text-[12px] ${
                p === period ? "border-[var(--primary)]/40 bg-[var(--primary)]/8 text-[var(--primary-hover)]"
                             : "border-hairline bg-surface-1 text-ink-subtle hover:bg-surface-3"}`}>{p}</a>
          ))}
        </nav>
      </div>

      {!b ? (
        <Panel className="p-8 text-center"><p className="text-[13px] text-ink-subtle">Nothing recorded for {period}.</p></Panel>
      ) : (
        <>
          <Panel className="mb-4 p-5">
            <div className="grid gap-4 sm:grid-cols-5">
              {[
                ["Tickmarks standing", String(b.counts.tickmarks)],
                ["Exceptions", String(b.counts.exceptions)],
                ["Still open", String(b.counts.unresolved)],
                ["Journal entries", String(b.counts.entries)],
                ["Rules in force", String(b.counts.rules)],
              ].map(([l, v]) => (
                <div key={l}>
                  <div className="eyebrow mb-1.5">{l}</div>
                  <div className="nums text-[20px] font-medium text-ink">{v}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <a href={`/api/binder?${q}&format=json`}
                className="focus-ring rounded-[var(--radius-md)] bg-[var(--primary)] px-3.5 py-2 text-[13px] font-medium text-[var(--on-primary)] hover:bg-[var(--primary-hover)]">
                Download the binder (JSON)
              </a>
              <a href={`/api/binder?${q}&format=csv`}
                className="focus-ring rounded-[var(--radius-md)] border border-hairline bg-surface-1 px-3.5 py-2 text-[13px] text-ink hover:bg-surface-3">
                Tickmarks (CSV)
              </a>
              {b.run ? (
                <span className="nums ml-auto text-[12px] text-ink-tertiary">
                  rulebook v{b.run.rulebookVersion} · {b.run.ruleHits} settled by rule · {b.run.llmCalls} model calls
                </span>
              ) : null}
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel className="p-5">
              <h3 className="mb-1 text-[15px] font-medium text-ink">Tickmarks</h3>
              <p className="mb-3 text-[12px] text-ink-subtle">
                Each names who asserted it and what it rests on.
                {b.counts.superseded > 0
                  ? ` ${b.counts.superseded} earlier verification${b.counts.superseded === 1 ? "" : "s"} were superseded by these, not deleted.`
                  : ""}
              </p>
              {b.tickmarks.length === 0 ? (
                <p className="text-[13px] text-ink-subtle">Nothing verified in this period yet.</p>
              ) : (
                <div className="max-h-[22rem] space-y-1.5 overflow-y-auto">
                  {b.tickmarks.map((t, i) => (
                    <div key={i} className="rounded-[var(--radius-sm)] border border-hairline bg-surface-1 px-2.5 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] text-ink">{t.subjectRef}</span>
                        <Badge kind={t.assertedBy === "rule" ? "rule" : "agent"}>{t.assertedBy}</Badge>
                        {t.confidence !== null ? <span className="nums text-[11px] text-ink-tertiary">{(t.confidence * 100).toFixed(0)}%</span> : null}
                      </div>
                      <p className="mt-1 text-[12px] leading-snug text-ink-muted">{t.note}</p>
                      {t.supportingRefs.length ? (
                        <p className="nums mt-0.5 text-[11px] text-ink-tertiary">supported by {t.supportingRefs.join(", ")}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <div className="space-y-4">
              <Panel className="p-5">
                <h3 className="mb-1 text-[15px] font-medium text-ink">Entries and who approved them</h3>
                <p className="mb-3 text-[12px] text-ink-subtle">Preparer and approver are recorded on every one.</p>
                {b.journalEntries.length === 0 ? (
                  <p className="text-[13px] text-ink-subtle">No entries this period.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {b.journalEntries.map((j, i) => (
                      <li key={i} className="rounded-[var(--radius-sm)] border border-hairline bg-surface-1 px-2.5 py-2 text-[12px]">
                        <div className="text-ink-muted">{j.memo}</div>
                        <div className="nums mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-ink-tertiary">
                          <span>{j.status}</span>
                          <span>prepared {j.preparer}</span>
                          <span>approved {j.approver ?? "—"}</span>
                          <span><Money cents={j.lines.reduce((s, l) => s + l.debitCents, 0)} /></span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel className="p-5">
                <h3 className="mb-1 text-[15px] font-medium text-ink">Rules that decided anything</h3>
                <p className="mb-3 text-[12px] text-ink-subtle">Each with the corrections that authorised it and its replay.</p>
                {b.rulesApplied.length === 0 ? (
                  <p className="text-[13px] text-ink-subtle">No rules in force.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {b.rulesApplied.map((r, i) => (
                      <li key={i} className="rounded-[var(--radius-sm)] border border-hairline bg-surface-1 px-2.5 py-2 text-[12px]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-ink">{r.name}</span>
                          {r.selfEvidenced ? <Badge kind="warn">self-evidenced</Badge> : null}
                        </div>
                        <div className="nums mt-0.5 text-[11px] text-ink-tertiary">
                          adopted by {r.adoptedBy ?? "—"} · {r.evidence.length} corrections
                          {r.backtest ? ` · replay ${r.backtest.correct}/${r.backtest.fired} at ${(r.backtest.precision * 100).toFixed(0)}%` : ""}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}
