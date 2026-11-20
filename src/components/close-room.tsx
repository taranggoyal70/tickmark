"use client";

import { useEffect, useRef, useState } from "react";
import type { DecisionFrame, PeriodReport } from "@/lib/agent/simulate";
import { SERIES } from "./charts";

/**
 * The close, watched rather than described.
 *
 * Two periods run the same books side by side: one before the agent had learned
 * anything, one after. The timing is not decorative - a decision settled by a
 * compiled Rule really is instant and free, while model-decided items represent
 * remaining agent work, so the trained lane finishes quieter for the
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
const colorOf = (f: DecisionFrame) =>
  f.outcome === "exception" ? SERIES.exception.color : f.by === "rule" ? SERIES.rule.color : SERIES.model.color;

function Lane({ period, frames, running, side, unpriced }: {
  period: PeriodReport; frames: DecisionFrame[]; running: boolean; side: "A" | "B";
  unpriced: boolean;
}) {
  const { i, done } = useReplay(frames, running);
  const seen = frames.slice(0, i);
  const cleared = seen.filter((f) => f.outcome === "tickmark").length;
  const exceptions = seen.filter((f) => f.outcome === "exception").length;
  const ruleHits = seen.filter((f) => f.by === "rule").length;
  const agentDecisions = seen.filter((f) => f.by === "agent").length;
  // cost accrues only where a model was actually asked
  const cost = (agentDecisions / Math.max(1, frames.filter((f) => f.by === "agent").length)) * period.stats.costMicros;
  const progress = frames.length ? i / frames.length : 0;
  const recent = seen.slice(-9).reverse();

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label={`${period.period} close`}>
      <div className="flex min-h-6 items-baseline gap-3">
        <span className="inline-flex shrink-0 items-center gap-2 font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-ink">
          <b className={`inline-grid h-[18px] w-[18px] place-items-center rounded-[4px] text-[11px] tracking-normal text-[var(--on-ink)] ${side === "B" ? "bg-signal" : "bg-[var(--ink)]"}`}>{side}</b>
          {period.period}
        </span>
        <span className="truncate text-[14px] text-muted">
          {period.activeRules === 0 ? "Before it learned anything." : `After ${period.activeRules} rules.`}
        </span>
      </div>

      <div className="panel-raised flex min-h-[540px] flex-col overflow-hidden">
        <div aria-hidden="true" className="relative h-px bg-[var(--line-2)]">
          <div className="absolute inset-y-0 left-0 bg-[var(--ink)] transition-[width] duration-150 ease-linear" style={{ width: `${progress * 100}%` }} />
        </div>

        <div className="grid grid-cols-4 border-b border-line">
          {[
            { l: "cleared", v: String(cleared) },
            { l: "for you", v: String(exceptions), hot: exceptions > 0 },
            { l: "by rule", v: String(ruleHits) },
            { l: unpriced ? "model" : "cost", v: unpriced ? String(agentDecisions) : `$${(cost / 1e6).toFixed(3)}` },
          ].map((s, n) => (
            <div key={s.l} className={`px-3 py-3 sm:px-4 ${n ? "border-l border-line" : ""}`}>
              <div className="label mb-2 text-[10px]">{s.l}</div>
              <div className={`nums text-[22px] font-medium leading-none tracking-[-0.03em] ${s.hot ? "text-signal" : "text-ink"}`}>{s.v}</div>
            </div>
          ))}
        </div>

        <ol className="m-0 flex-1 list-none overflow-hidden p-0">
          {recent.map((f, n) => (
            <li key={`${f.ref}-${i}-${n}`}
              className="grid grid-cols-[8px_44px_minmax(0,1fr)_auto] items-baseline gap-3 border-b border-line px-4 py-2 text-[12.5px]"
              style={{ opacity: Math.max(0.45, 1 - n * 0.075) }}>
              <i aria-hidden="true" className="inline-block h-[7px] w-[7px] self-center" style={{ background: colorOf(f) }} />
              <span className="font-mono text-[11px] text-muted">{f.outcome === "exception" ? "you" : f.by === "rule" ? "rule" : "model"}</span>
              <span className="truncate text-ink-2">{f.label}</span>
              <span className="nums font-mono text-[11px] text-muted">{usd(f.amountCents)}</span>
            </li>
          ))}
          {!seen.length ? <li className="px-4 py-3 font-mono text-[12px] text-muted">Waiting to start.</li> : null}
        </ol>

        {done ? (
          <div className="border-t border-line px-4 py-3.5">
            <p className="m-0 text-[14px] text-ink">
              Closed. <span className="text-signal">{exceptions}</span> {exceptions === 1 ? "item needs" : "items need"} you.
            </p>
            <p className="m-0 mt-1 font-mono text-[11.5px] text-muted">
              {ruleHits
                ? `${ruleHits} settled by rules, with no model call.`
                : unpriced
                  ? "Nothing learned yet: every decision went to the model."
                  : "Nothing learned yet: every call was paid for."}
            </p>
          </div>
        ) : null}
      </div>
    </section>
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

  // → or Enter starts (or replays) both closes, unless focus is in a field
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName))) return;
      if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); setRunId((n) => n + 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const saved = cold.exceptions.length - trained.exceptions.length;
  const unpriced = periods.some((period) => period.stats.llmCalls > 0)
    && periods.every((period) => period.stats.costMicros === 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-y border-line py-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-[11.5px] text-muted">
          {([["rule", "settled by a rule"], ["model", "decided by the model"], ["exception", "sent to you"]] as const).map(([k, label]) => (
            <span key={k} className="inline-flex items-center gap-2">
              <i aria-hidden="true" className="inline-block h-[7px] w-[7px]" style={{ background: SERIES[k].color }} />
              {label}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 font-mono text-[12px] text-muted sm:inline-flex">
            press <span className="kbd">→</span> to {running ? "replay" : "start"}
          </span>
          <button onClick={start} className="btn btn-sm btn-primary">
            {running ? "Run again" : "Run both closes"} <span className="arrow">→</span>
          </button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)] lg:gap-0">
        <Lane key={`a-${runId}`} period={cold} frames={cold.decisions ?? []} running={running} side="A" unpriced={unpriced} />
        <div aria-hidden="true" className="relative hidden place-items-center lg:grid">
          <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-[var(--line-2)]" />
          <span className="relative bg-[var(--bg)] py-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted [writing-mode:vertical-rl] rotate-180">
            same books
          </span>
        </div>
        <Lane key={`b-${runId}`} period={trained} frames={trained.decisions ?? []} running={running} side="B" unpriced={unpriced} />
      </div>

      <p className="mt-6 max-w-[64ch] text-[14px] leading-relaxed text-muted">
        Same books, same model, same prompts. The only difference is the {trained.activeRules} rules the agent
        earned from corrections a controller already made, which is why the right-hand close hands back{" "}
        <span className="text-ink">{saved} fewer items</span> and needs less model work.
      </p>
    </div>
  );
}
