import { DecisionMix, TrendLine } from "@/components/charts";
import { Panel, Stat } from "@/components/kit";
import { EmptyRun, Shell } from "@/components/shell";
import { latestReport, minutes, pct, usdFromMicros } from "@/lib/report";

export const dynamic = "force-dynamic";

export default async function ClosePage() {
  const report = await latestReport();
  if (!report) return <Shell active="/close"><EmptyRun /></Shell>;

  const P = report.periods;
  const first = P[0], last = P[P.length - 1];
  const labels = P.map((p) => p.period.replace("2026-", ""));

  const costDrop = first.stats.costMicros > 0 ? 1 - last.stats.costMicros / first.stats.costMicros : 0;
  const timeDrop = first.touchSeconds > 0 ? 1 - last.touchSeconds / first.touchSeconds : 0;
  const precisionHeld = last.stats.autoClearPrecision >= 0.99;

  return (
    <Shell active="/close">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Close performance · {report.entity}</div>
          <h1 className="display-md text-ink">
            Four closes. Same agent.<br />
            <span className="text-ink-subtle">It learned the difference.</span>
          </h1>
        </div>
        <div className="text-right text-[12px] leading-relaxed text-ink-tertiary">
          <div className="nums">{report.model.replace("anthropic/", "")}</div>
          <div className="nums">{new Date(report.generatedAt).toLocaleString()}</div>
          <div>rulebook v{last.rulebookVersionOut} · {last.activeRules} active rules</div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Auto-cleared without a human"
          value={pct(last.stats.autoClearRate)}
          tone="good"
          sub={<>up from {pct(first.stats.autoClearRate)} in {first.period}</>}
        />
        <Stat
          label="Cost per close"
          value={usdFromMicros(last.stats.costMicros)}
          tone="good"
          sub={<>{pct(costDrop)} cheaper than {first.period}, on the same model</>}
        />
        <Stat
          label="Controller time"
          value={minutes(last.touchSeconds)}
          tone="good"
          sub={<>{pct(timeDrop)} less queue work than {first.period}&rsquo;s {minutes(first.touchSeconds)}</>}
        />
        <Stat
          label="Auto-clear precision"
          value={pct(last.stats.autoClearPrecision, 1)}
          tone={precisionHeld ? "good" : "bad"}
          sub={<>of what it cleared unattended was right{precisionHeld ? "" : " — below bar"}</>}
        />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <TrendLine
          title="Auto-clear rate"
          note="Share of decisions the agent finished on its own. The rest went to the exception queue."
          points={P.map((p, i) => ({ label: labels[i], value: p.stats.autoClearRate }))}
          format={(v) => pct(v)}
          domainMax={1}
          goodDirection="up"
        />
        <TrendLine
          title="Auto-clear precision"
          note="Of the lines it cleared unattended, the share that was actually right. Nobody reviews these, so this is the number that must not fall."
          points={P.map((p, i) => ({ label: labels[i], value: p.stats.autoClearPrecision }))}
          format={(v) => pct(v, 1)}
          domainMax={1}
          goodDirection="flat"
        />
        <TrendLine
          title="Cost per close"
          note="Same model throughout. Cost falls because compiled rules retire model calls, not because the model got cheaper."
          points={P.map((p, i) => ({ label: labels[i], value: p.stats.costMicros / 1e6 }))}
          format={(v) => `$${v.toFixed(3)}`}
          goodDirection="down"
        />
        <TrendLine
          title="Controller time in the queue"
          note="Exceptions × observed median handling time. The line a CFO actually feels."
          points={P.map((p, i) => ({ label: labels[i], value: p.touchSeconds / 60 }))}
          format={(v) => `${Math.round(v)}m`}
          goodDirection="down"
        />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <DecisionMix
          title="Where each decision came from"
          note="Blue is free. Every line the Rulebook settles costs zero tokens and never reaches a person."
          categories={labels}
          series={[
            { key: "rule", values: P.map((p) => p.stats.ruleHits) },
            { key: "model", values: P.map((p) => p.modelDecisions) },
            { key: "exception", values: P.map((p) => p.stats.exceptionsOpened) },
          ]}
        />

        <Panel className="p-5">
          <h3 className="mb-1 text-[15px] font-medium text-ink">Per-period detail</h3>
          <p className="mb-4 text-[12px] text-ink-subtle">Every figure measured against ground truth the agent never sees.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] nums">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-ink-tertiary">
                  <th className="pb-2 font-medium">Period</th>
                  <th className="pb-2 text-right font-medium">Coding</th>
                  <th className="pb-2 text-right font-medium">Match</th>
                  <th className="pb-2 text-right font-medium">Exc</th>
                  <th className="pb-2 text-right font-medium">Calls</th>
                  <th className="pb-2 text-right font-medium">Cost</th>
                  <th className="pb-2 text-right font-medium">v</th>
                </tr>
              </thead>
              <tbody>
                {P.map((p) => (
                  <tr key={p.period} className="border-t border-[var(--hairline)]">
                    <td className="py-2 text-ink-muted">{p.period}</td>
                    <td className="py-2 text-right text-ink">{pct(p.stats.codingAccuracy)}</td>
                    <td className="py-2 text-right text-ink">{pct(p.stats.matchAccuracy)}</td>
                    <td className="py-2 text-right text-ink">{p.stats.exceptionsOpened}</td>
                    <td className="py-2 text-right text-ink-muted">{p.stats.llmCalls}</td>
                    <td className="py-2 text-right text-ink-muted">{usdFromMicros(p.stats.costMicros)}</td>
                    <td className="py-2 text-right text-ink-tertiary">{p.rulebookVersionOut}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </Shell>
  );
}
