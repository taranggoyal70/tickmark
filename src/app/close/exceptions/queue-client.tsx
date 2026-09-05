"use client";

import { useState, useTransition } from "react";
import { Badge, Money } from "@/components/kit";
import type { QueueItem } from "@/lib/store/queue";
import type { ResolveOutcome } from "@/lib/store/queue";
import { adoptAction, resolveAction } from "./actions";

const CAUSE: Record<string, { badge: string; label: string; why: string }> = {
  over_materiality:      { badge: "warn",    label: "Over materiality",  why: "Above the threshold, so a human reviews it however confident the agent is." },
  low_confidence:        { badge: "bad",     label: "Low confidence",    why: "The agent declined to assert this one. That is the system working." },
  policy_requires_human: { badge: "human",   label: "Policy",            why: "A standing rule sends this class of item to a person every time." },
  no_candidate:          { badge: "neutral", label: "No match found",    why: "On the bank, nothing in the ledger explains it. Usually a timing difference." },
  ambiguous_candidates:  { badge: "warn",    label: "Ambiguous",         why: "More than one credible answer. Forcing a pick here would be guessing." },
};

function ProposalLine({ item }: { item: QueueItem }) {
  const p = item.proposal;
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
    return <span className="text-ink-muted">accrue <Money cents={p.suggestedCents} /></span>;
  }
  if (typeof p.description === "string") {
    return <span className="text-ink-muted">{p.description}{p.why ? <span className="text-ink-tertiary"> — {String(p.why)}</span> : null}</span>;
  }
  return <span className="text-ink-tertiary">no proposal</span>;
}

function Outcome({ outcome, onAdopt, busy }: {
  outcome: ResolveOutcome; busy: boolean;
  onAdopt: (ruleId: string, accept: boolean) => void;
}) {
  if (outcome.kind === "resolved") {
    return <p className="text-[12px] text-[var(--success)]">Resolved. Recorded as a correction.</p>;
  }
  if (outcome.kind === "intent_recorded") {
    return (
      <div className="rounded-[var(--radius-md)] border border-[var(--warning)]/35 bg-[var(--warning)]/8 p-3">
        <p className="text-[13px] text-[#f5cc6b]">Noted — but not yet a rule.</p>
        <p className="mt-1 text-[12px] leading-snug text-ink-muted">
          One correction is an anecdote. I&rsquo;ve recorded a standing intent for{" "}
          <span className="text-ink">{outcome.scope}</span> and will propose a rule the next time
          a correction agrees with it.
        </p>
      </div>
    );
  }
  const weak = !outcome.adoptable;
  return (
    <div className={`rounded-[var(--radius-md)] border p-3 ${weak ? "border-[var(--danger)]/35 bg-[var(--danger)]/8" : "border-[var(--primary)]/40 bg-[var(--primary)]/8"}`}>
      <p className={`text-[13px] ${weak ? "text-[#ef8686]" : "text-[#a8b0f5]"}`}>
        {weak ? "Seconded — but the replay says no." : "Seconded — rule proposed."}
      </p>
      <p className="mt-1 nums text-[12px] text-ink-muted">
        <span className="text-ink">{outcome.ruleName}</span>
        <span className="text-ink-tertiary"> · backtest fired {outcome.fired}× at {(outcome.precision * 100).toFixed(0)}% precision</span>
      </p>
      {weak ? (
        <p className="mt-1.5 text-[12px] leading-snug text-ink-muted">
          It did not clear the bar against closed periods, so it cannot be adopted. The instruction is kept —
          a later period may give it the evidence it needs.
        </p>
      ) : null}
      <div className="mt-2.5 flex gap-2">
        {weak ? null : (
          <button disabled={busy} onClick={() => onAdopt(outcome.ruleId, true)}
            className="focus-ring rounded-[var(--radius-sm)] bg-[var(--primary)] px-2.5 py-1 text-[12px] font-medium text-[var(--on-primary)] hover:bg-[var(--primary-hover)] disabled:opacity-50">
            Adopt rule
          </button>
        )}
        <button disabled={busy} onClick={() => onAdopt(outcome.ruleId, false)}
          className="focus-ring rounded-[var(--radius-sm)] border border-hairline bg-surface-2 px-2.5 py-1 text-[12px] text-ink-subtle hover:bg-surface-3 disabled:opacity-50">
          {weak ? "Discard proposal" : "Reject"}
        </button>
      </div>
    </div>
  );
}

export function QueueRow({ item }: { item: QueueItem }) {
  const [always, setAlways] = useState(false);
  const [outcome, setOutcome] = useState<ResolveOutcome | null>(null);
  const [adopted, setAdopted] = useState<null | boolean>(null);
  const [pending, start] = useTransition();
  const c = CAUSE[item.cause] ?? CAUSE.no_candidate;

  const resolve = (option: { label: string; value: unknown }, action: string) =>
    start(async () => {
      setOutcome(await resolveAction(item.id, { action, choice: option.value, label: option.label }, always));
    });

  const adopt = (ruleId: string, accept: boolean) =>
    start(async () => { await adoptAction(ruleId, accept); setAdopted(accept); });

  return (
    <div className={`panel p-4 transition-opacity ${outcome ? "opacity-95" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[12px] text-ink">{item.subjectRef}</span>
            <Badge kind={c.badge}>{c.label}</Badge>
            {item.vendor ? <span className="text-[12px] text-ink-tertiary">{item.vendor}</span> : null}
            {item.confidence !== null ? (
              <span className="nums text-[12px] text-ink-tertiary">confidence {(item.confidence * 100).toFixed(0)}%</span>
            ) : null}
          </div>
          <div className="text-[13px]"><span className="text-ink-tertiary">agent proposes </span><ProposalLine item={item} /></div>
          <p className="mt-1.5 text-[12px] leading-snug text-ink-tertiary">{c.why}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <Money cents={item.amountCents} className="text-[15px] font-medium" />
          {!outcome ? (
            <div className="flex flex-wrap justify-end gap-1.5">
              {item.options.slice(0, 2).map((o, i) => (
                <button
                  key={i}
                  disabled={pending}
                  onClick={() => resolve(o, i === 0 ? "accept" : "amend")}
                  className={`focus-ring rounded-[var(--radius-sm)] border px-2 py-1 text-[12px] transition-colors disabled:opacity-50 ${
                    i === 0
                      ? "border-[var(--primary)]/40 bg-[var(--primary)]/10 text-[#a8b0f5] hover:bg-[var(--primary)]/20"
                      : "border-hairline bg-surface-2 text-ink-subtle hover:bg-surface-3"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {!outcome && item.vendor ? (
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12px] text-ink-subtle">
          <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--primary)]" />
          Always do this for <span className="text-ink-muted">{item.vendor}</span>
        </label>
      ) : null}

      {outcome ? (
        <div className="mt-3">
          {adopted === null
            ? <Outcome outcome={outcome} busy={pending} onAdopt={adopt} />
            : <p className={`text-[12px] ${adopted ? "text-[var(--success)]" : "text-ink-subtle"}`}>
                {adopted ? "Rule adopted. It runs for free from the next close." : "Proposal rejected. Nothing changed."}
              </p>}
        </div>
      ) : null}
    </div>
  );
}
