"use client";

import { useState, useTransition } from "react";
import { Money } from "@/components/kit";
import type { PendingEntry } from "@/lib/store/entries";
import { decideEntryAction } from "./actions";

export function EntryCard({ entry }: { entry: PendingEntry }) {
  const [done, setDone] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const decide = (approve: boolean) => start(async () => setDone(await decideEntryAction(entry.id, approve)));

  const debits = entry.lines.reduce((s, l) => s + l.debitCents, 0);
  const credits = entry.lines.reduce((s, l) => s + l.creditCents, 0);
  const balanced = debits === credits;

  return (
    <div className="panel p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="text-[14px] font-medium text-ink">{entry.memo}</span>
          <span className="nums ml-2 text-[12px] text-ink-tertiary">{entry.periodCode} · {entry.kind}</span>
        </div>
        <span className="nums text-[12px] text-ink-tertiary">prepared by {entry.preparer}</span>
      </div>

      <table className="w-full text-[13px] nums">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-ink-tertiary">
            <th className="pb-1.5 font-medium">Account</th>
            <th className="pb-1.5 text-right font-medium">Debit</th>
            <th className="pb-1.5 text-right font-medium">Credit</th>
          </tr>
        </thead>
        <tbody>
          {entry.lines.map((l, i) => (
            <tr key={i} className="border-t border-[var(--hairline)]">
              <td className="py-1.5 text-ink-muted">
                <span className="text-ink">{l.glCode}</span> {l.glName}
              </td>
              <td className="py-1.5 text-right">{l.debitCents ? <Money cents={l.debitCents} /> : <span className="text-ink-tertiary">—</span>}</td>
              <td className="py-1.5 text-right">{l.creditCents ? <Money cents={l.creditCents} /> : <span className="text-ink-tertiary">—</span>}</td>
            </tr>
          ))}
          <tr className="border-t border-[var(--hairline-strong)]">
            <td className="py-1.5 text-[12px] text-ink-subtle">{balanced ? "Balanced" : "Out of balance"}</td>
            <td className="py-1.5 text-right font-medium"><Money cents={debits} /></td>
            <td className="py-1.5 text-right font-medium"><Money cents={credits} /></td>
          </tr>
        </tbody>
      </table>

      {done ? (
        <p className={`mt-3 text-[13px] ${done.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{done.message}</p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button disabled={pending || !balanced} onClick={() => decide(true)}
            className="focus-ring rounded-[var(--radius-sm)] bg-[var(--primary)] px-3 py-1.5 text-[12px] font-medium text-[var(--on-primary)] hover:bg-[var(--primary-hover)] disabled:opacity-50">
            Approve and post
          </button>
          <button disabled={pending} onClick={() => decide(false)}
            className="focus-ring rounded-[var(--radius-sm)] border border-hairline bg-surface-1 px-3 py-1.5 text-[12px] text-ink-subtle hover:bg-surface-3 disabled:opacity-50">
            Reject
          </button>
          <span className="text-[12px] text-ink-tertiary">
            Your name is recorded as approver. The agent prepared it and cannot approve its own entry.
          </span>
        </div>
      )}
    </div>
  );
}
