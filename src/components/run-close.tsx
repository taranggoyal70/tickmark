"use client";

import { useState, useTransition } from "react";
import { runCloseAction, type CloseOutcome } from "@/app/close/actions";

const usd = (m: number) => `$${(m / 1e6).toFixed(4)}`;

export function RunClose({ entity, periods }: { entity: string; periods: string[] }) {
  const [period, setPeriod] = useState(periods[periods.length - 1]);
  const [outcome, setOutcome] = useState<CloseOutcome | null>(null);
  const [pending, start] = useTransition();

  const run = () => start(async () => setOutcome(await runCloseAction(entity, period)));

  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="eyebrow mb-1">Run a close</div>
          <p className="text-[12px] text-ink-subtle">Against this entity&rsquo;s ingested books, using the rulebook it has earned.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="focus-ring nums rounded-[var(--radius-md)] border border-hairline bg-surface-2 px-2.5 py-2 text-[13px] text-ink"
          >
            {periods.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button
            onClick={run}
            disabled={pending}
            className="focus-ring rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2 text-[13px] font-medium text-[var(--on-primary)] transition-colors hover:bg-[var(--primary-hover)] disabled:opacity-50"
          >
            {pending ? "Closing…" : "Close the books"}
          </button>
        </div>
      </div>

      {outcome ? (
        <div className={`mt-3 rounded-[var(--radius-md)] border p-3 text-[13px] ${
          outcome.ok ? "border-[var(--primary)]/30 bg-[var(--primary)]/6" : "border-[var(--danger)]/30 bg-[var(--danger)]/6"}`}>
          <p className={outcome.ok ? "text-ink" : "text-[var(--danger)]"}>{outcome.message}</p>
          {outcome.ok ? (
            <p className="nums mt-1 text-[12px] text-ink-subtle">
              {outcome.tickmarks} tickmarks · {outcome.ruleHits} settled free by rules · {outcome.exceptions} to review
              {outcome.journalEntries ? ` · ${outcome.journalEntries} accruals drafted` : ""} · {usd(outcome.costMicros ?? 0)}
            </p>
          ) : null}
          {outcome.degraded ? (
            <p className="mt-1.5 text-[12px] text-[#8a5a00]">
              The model was unreachable, so the rulebook settled what it already knew and the rest went to the queue.
              The close still completed.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
