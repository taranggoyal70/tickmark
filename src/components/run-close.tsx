"use client";

import { useState, useTransition } from "react";
import { runCloseAction, type CloseOutcome } from "@/app/close/actions";

const usd = (m: number) => `$${(m / 1e6).toFixed(4)}`;

type Closable = { id: string; name: string; periods: string[] };

const field =
  "focus-ring nums h-8 rounded-[var(--radius-sm)] border border-line bg-[var(--surface)] px-2.5 text-[13px] text-ink";

/** Close one of the signed-in user's own periods, against the rulebook those books have earned. */
export function RunClose({ books, limit }: { books: Closable[]; limit: number }) {
  const [entityId, setEntityId] = useState(books[0].id);
  const entity = books.find((b) => b.id === entityId) ?? books[0];
  const [period, setPeriod] = useState(entity.periods[entity.periods.length - 1]);
  const [outcome, setOutcome] = useState<CloseOutcome | null>(null);
  const [pending, start] = useTransition();

  const pickEntity = (id: string) => {
    const next = books.find((b) => b.id === id) ?? books[0];
    setEntityId(next.id);
    setPeriod(next.periods[next.periods.length - 1]);
    setOutcome(null);
  };
  const run = () => start(async () => setOutcome(await runCloseAction(entity.id, period)));

  return (
    <section aria-label="Run a close" className="panel-raised p-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="min-w-0">
          <div className="label mb-1.5">Run a close</div>
          <p className="m-0 text-[13px] text-muted">
            On your imported books, using the rulebook they have earned.{" "}
            {limit > 0 ? `Up to ${limit} a day.` : "Turned off on this deployment."}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {books.length > 1 ? (
            <select aria-label="Company" value={entity.id} onChange={(e) => pickEntity(e.target.value)} className={field}>
              {books.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          ) : (
            <span className="text-[13px] text-ink-2">{entity.name}</span>
          )}
          <select aria-label="Period" value={period} onChange={(e) => { setPeriod(e.target.value); setOutcome(null); }} className={field}>
            {entity.periods.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button type="button" onClick={run} disabled={pending || limit === 0} className="btn btn-sm btn-primary disabled:opacity-50">
            {pending ? "Closing…" : <>Close the books <span className="arrow">→</span></>}
          </button>
        </div>
      </div>

      {outcome ? (
        <div role="status" className="mt-4 border-t border-line pt-4 text-[13px]">
          <p className={`m-0 ${outcome.ok ? "text-ink" : "text-signal-ink"}`}>{outcome.message}</p>
          {outcome.ok ? (
            <p className="nums m-0 mt-1 font-mono text-[12px] text-muted">
              {outcome.tickmarks} tickmarks · {outcome.ruleHits} settled free by rules · {outcome.exceptions} to review
              {outcome.journalEntries ? ` · ${outcome.journalEntries} accruals drafted` : ""} · {usd(outcome.costMicros ?? 0)}
            </p>
          ) : null}
          {outcome.degraded ? (
            <p className="m-0 mt-1.5 text-[12px] text-signal-ink">
              The model was unreachable, so the rulebook settled what it already knew and the rest went to the queue.
              The close still completed.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
