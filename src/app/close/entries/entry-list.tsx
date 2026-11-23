"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Money } from "@/components/kit";
import type { PendingEntry } from "@/lib/store/entries";
import { decideEntryAction } from "./actions";

export function EntryCard({ entry, canDecide, showEntity, signedIn }: {
  entry: PendingEntry;
  /** The viewer is a member of these books, so the decision is theirs to make. */
  canDecide: boolean;
  /** Name the company: the viewer can see more than one. */
  showEntity: boolean;
  signedIn: boolean;
}) {
  const [done, setDone] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const decide = (approve: boolean) => start(async () => setDone(await decideEntryAction(entry.id, approve)));

  const debits = entry.lines.reduce((s, l) => s + l.debitCents, 0);
  const credits = entry.lines.reduce((s, l) => s + l.creditCents, 0);
  const balanced = debits === credits;

  return (
    <div className="panel p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          {showEntity ? <div className="label mb-1">{entry.entity}</div> : null}
          <span className="text-[14px] font-medium text-ink">{entry.memo}</span>
          <span className="nums ml-2 font-mono text-[12px] text-muted">{entry.periodCode} · {entry.kind}</span>
        </div>
        <span className="nums font-mono text-[12px] text-muted">prepared by {entry.preparer}</span>
      </div>

      <table className="nums w-full text-[13px]">
        <thead>
          <tr className="label text-left">
            <th className="pb-1.5 font-medium">Account</th>
            <th className="pb-1.5 text-right font-medium">Debit</th>
            <th className="pb-1.5 text-right font-medium">Credit</th>
          </tr>
        </thead>
        <tbody>
          {entry.lines.map((l, i) => (
            <tr key={i} className="border-t border-line">
              <td className="py-1.5 text-ink-2">
                <span className="font-mono text-ink">{l.glCode}</span> {l.glName}
              </td>
              <td className="py-1.5 text-right">{l.debitCents ? <Money cents={l.debitCents} /> : <span className="text-muted">-</span>}</td>
              <td className="py-1.5 text-right">{l.creditCents ? <Money cents={l.creditCents} /> : <span className="text-muted">-</span>}</td>
            </tr>
          ))}
          <tr className="border-t border-[var(--line-3)]">
            <td className="py-1.5 text-[12px] text-muted">{balanced ? "Balanced" : "Out of balance"}</td>
            <td className="py-1.5 text-right font-medium"><Money cents={debits} /></td>
            <td className="py-1.5 text-right font-medium"><Money cents={credits} /></td>
          </tr>
        </tbody>
      </table>

      {done ? (
        <p role="status" className={`m-0 mt-4 text-[13px] ${done.ok ? "text-[var(--ok)]" : "text-signal-ink"}`}>{done.message}</p>
      ) : canDecide ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" disabled={pending || !balanced} onClick={() => decide(true)} className="btn btn-sm btn-primary disabled:opacity-50">
            Approve and post
          </button>
          <button type="button" disabled={pending} onClick={() => decide(false)} className="btn btn-sm disabled:opacity-50">
            Reject
          </button>
          <span className="text-[12px] text-muted">
            Your name is recorded as approver. The agent prepared it and cannot approve its own entry.
          </span>
        </div>
      ) : (
        <p className="m-0 mt-4 font-mono text-[12px] text-muted">
          {signedIn
            ? "Demo books: read-only. Approvals happen on books you import."
            : <>Read-only. <Link href="/sign-in" className="text-ink underline decoration-[var(--line-2)] underline-offset-4">Sign in</Link> to approve entries on your own books.</>}
        </p>
      )}
    </div>
  );
}
