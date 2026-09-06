"use client";

import { useEffect, useRef, useState } from "react";
import type { DecisionFrame, PeriodReport } from "@/lib/agent/simulate";
import { SERIES } from "./charts";

/**
 * The close, watched rather than described.
 *
 * Two periods run the same books side by side: one before the agent had learned
 * anything, one after. The timing is not decorative - a decision settled by a
 * compiled Rule really is instant and free, and a model call really does cost
 * time and tokens, so the trained lane finishes quieter and cheaper for the
 * reason the product claims.
 */

const RULE_MS = 20;    // a compiled rule is a predicate check - effectively instant
const AGENT_MS = 175;  // a model call is a network round trip

/** `done` is derived, not stored - there is only one piece of state here. */
function useReplay(frames: DecisionFrame[], running: boolean) {
  const [i, setI] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!running || i >= frames.length) return;
    const f = frames[i];
    timer.current = setTimeout(() => setI((n) => n + 1), f.by === "rule" ? RULE_MS : AGENT_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [running, i, frames]);

  return { i, done: running && i >= frames.length };
}

const usd = (c: number) => `$${Math.abs(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

function Lane({ period, frames, running, tone }: {
  period: PeriodReport; frames: DecisionFrame[]; running: boolean; tone: "cold" | "trained";
}) {
  const { i, done } = useReplay(frames, running);
  const seen = frames.slice(0, i);
  const cleared = seen.filter((f) => f.outcome === "tickmark").length;
  const exceptions = seen.filter((f) => f.outcome === "exception").length;
  const ruleHits = seen.filter((f) => f.by === "rule").length;
  const agentCalls = seen.filter((f) => f.by === "agent").length;
  // cost accrues only where a model was actually asked
  const cost = (agentCalls / Math.max(1, frames.filter((f) => f.by === "agent").length)) * period.stats.costMicros;
  const pct = frames.length ? Math.round((i / frames.length) * 100) : 0;
  const recent = seen.slice(-9).reverse();

  return (
    <div className="panel flex min-h-[560px] flex-col overflow-hidden">
      <div className="hairline-b px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="nums text-[15px] font-medium text-ink">{period.period}</span>
          <span className={`rounded-[var(--radius-sm)] border px-2 py-0.5 text-[11px] ${
            tone === "trained"
              ? "border-[#3987e5]/40 bg-[#3987e5]/12 text-[#7fb4f0]"
              : "border-hairline bg-surface-3 text-ink-subtle"}`}>
            {period.activeRules === 0 ? "no rules yet" : `${period.activeRules} rules learned`}
          </span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full transition-[width] duration-150 ease-linear"
            style={{ width: `${pct}%`, background: tone === "trained" ? SERIES.rule.color : SERIES.model.color }} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-px bg-[var(--hairline)]">
        {[
          { l: "cleared", v: String(cleared) },
          { l: "for you", v: String(exceptions), warn: true },
          { l: "free", v: String(ruleHits) },
          { l: "cost", v: `$${(cost / 1e6).toFixed(3)}` },
        ].map((s) => (
          <div key={s.l} className="bg-surface-1 px-2 py-2.5 text-center">
            <div className="eyebrow mb-1 text-[10px]">{s.l}</div>
            <div className={`nums text-[17px] font-semibold leading-none ${s.warn && exceptions ? "text-[#f0916a]" : "text-ink"}`}>{s.v}</div>
          </div>
        ))}
      </div>

      <div className="flex-1 space-y-1 overflow-hidden p-2">
        {recent.map((f, n) => (
          <div key={`${f.ref}-${i}-${n}`}
            className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-hairline bg-surface-2 px-2 py-1.5 text-[11px]"
            style={{ opacity: Math.max(0.25, 1 - n * 0.11) }}>
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: f.outcome === "exception" ? SERIES.exception.color : f.by === "rule" ? SERIES.rule.color : SERIES.model.color }} />
            <span className="shrink-0 font-mono text-ink-tertiary">{f.by === "rule" ? "rule" : "model"}</span>
            <span className="min-w-0 flex-1 truncate text-ink-muted">{f.label}</span>
            <span className="nums shrink-0 text-ink-tertiary">{usd(f.amountCents)}</span>
          </div>
        ))}
        {!seen.length ? <p className="px-1 pt-2 text-[12px] text-ink-tertiary">Waiting to start.</p> : null}
      </div>

      {done ? (
        <div className="hairline-t px-4 py-3">
          <p className="text-[13px] text-ink">
            Closed. <span className="text-[#f0916a]">{exceptions}</span> items need you.
          </p>
          <p className="mt-0.5 text-[12px] text-ink-tertiary">
            {ruleHits ? `${ruleHits} settled by rules, at no cost.` : "Nothing learned yet — every call was paid for."}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function CloseRoom({ periods }: { periods: PeriodReport[] }) {
  const cold = periods[0];
  const trained = periods[periods.length - 1];
  // One piece of state. Bumping it remounts both lanes, which resets their
  // position and starts them together - no timers to coordinate.
  const [runId, setRunId] = useState(0);
  const running = runId > 0;
  const start = () => setRunId((n) => n + 1);

  const saved = cold.exceptions.length - trained.exceptions.length;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
          {[["rule", "settled by a rule · free"], ["model", "asked the model · costs tokens"], ["exception", "sent to the controller"]].map(([k, label]) => (
            <span key={k} className="inline-flex items-center gap-1.5 text-ink-muted">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: SERIES[k as keyof typeof SERIES].color }} />
              {label}
            </span>
          ))}
        </div>
        <button onClick={start}
          className="focus-ring rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2 text-[13px] font-medium text-[var(--on-primary)] transition-colors hover:bg-[var(--primary-hover)]">
          {running ? "Run again" : "Run both closes"}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Lane key={`a-${runId}`} period={cold} frames={cold.decisions ?? []} running={running} tone="cold" />
        <Lane key={`b-${runId}`} period={trained} frames={trained.decisions ?? []} running={running} tone="trained" />
      </div>

      <p className="mt-5 text-[13px] leading-relaxed text-ink-subtle">
        Same books, same model, same prompts. The only difference is {trained.activeRules} rules the agent
        earned from corrections a controller already made — which is why the right-hand close hands back{" "}
        <span className="text-ink">{saved} fewer items</span> and pays for fewer of its own decisions.
      </p>
    </div>
  );
}
