import Link from "next/link";
import { ProvenanceBanner } from "@/components/provenance";
import { Mark } from "@/components/shell";
import { latestReport, minutes, pct, usdFromMicros } from "@/lib/report";

export const dynamic = "force-dynamic";

const LOOP = [
  { k: "Rulebook",    d: "the weights - deterministic rules the agent has already earned" },
  { k: "Close run",   d: "the forward pass - rules first, model only on the residue" },
  { k: "Corrections", d: "the loss signal - what the controller changed, captured structurally" },
  { k: "Gradient step", d: "distil corrections into candidate rules, backtested against every closed period" },
  { k: "The human gate", d: "a controller accepts or rejects. Analysis never writes." },
];

const WORK = [
  {
    t: "Bank reconciliation",
    d: "Ties the statement to the ledger across all four cardinalities - one payment, an ACH batch against six invoices, an invoice settled in two tranches, a lockbox deposit. Names every residual as fx, fee, partial or timing, or refuses the match.",
  },
  {
    t: "AP invoice coding",
    d: "GL account, department, and class per invoice - including the split allocations that are pure tribal knowledge, like cloud spend carved 60/25/15 across Engineering, Data and Product.",
  },
  {
    t: "Accrual completeness",
    d: "Finds the recurring cost that was incurred but never invoiced before cut-off, sizes it off trailing actuals, and books it as a balanced entry with a preparer and an approver who are not the same person.",
  },
];

export default async function Home() {
  const report = await latestReport();
  const first = report?.periods[0];
  const last = report?.periods[report.periods.length - 1];
  const degraded = report?.periods.some(
    (period) => period.stats.modelFailures > 0 || period.gradientSkipped,
  ) ?? false;

  return (
    <div className="flex min-h-full flex-col">
      <header className="hairline-b">
        <div className="mx-auto flex h-14 w-full max-w-[1240px] items-center gap-2 px-6">
          <Mark className="h-4 w-4 text-[var(--primary)]" />
          <span className="text-[14px] font-semibold tracking-[-0.01em]">Tickmark</span>
          <Link href="/close" className="focus-ring ml-auto rounded-[var(--radius-md)] bg-[var(--primary)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--on-primary)] transition-colors hover:bg-[var(--primary-hover)]">
            Open the close
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* hero */}
        <section className="mx-auto w-full max-w-[1240px] px-6 pt-20 pb-16 sm:pt-28">
          <div className="max-w-3xl">
            <div className="eyebrow mb-5">Office of the CFO · month-end close</div>
            <h1 className="display-xl text-ink">
              The close that<br />gets cheaper every month.
            </h1>
            <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-ink-muted">
              Tickmark codes the AP ledger and reconciles the bank, hands the controller only
              what genuinely needs judgment, and compiles every correction they make into a
              deterministic rule. The judgment gets made once. After that it runs for free.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/close/run" className="focus-ring rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2.5 text-[14px] font-medium text-[var(--on-primary)] transition-colors hover:bg-[var(--primary-hover)]">
                Watch it close the books
              </Link>
              <Link href="/close" className="focus-ring rounded-[var(--radius-md)] border border-hairline bg-surface-1 px-4 py-2.5 text-[14px] font-medium text-ink transition-colors hover:bg-surface-3">
                {degraded ? "See the fail-safe report" : "See the measured results"}
              </Link>
              <Link href="/close/rulebook" className="focus-ring rounded-[var(--radius-md)] border border-hairline bg-surface-1 px-4 py-2.5 text-[14px] font-medium text-ink transition-colors hover:bg-surface-3">
                Read what it learned
              </Link>
            </div>
          </div>

          {report && first && last ? (
            <div className="mt-16">
              <ProvenanceBanner report={report} />
              <div className="grid gap-px overflow-hidden rounded-[var(--radius-xl)] border border-hairline bg-[var(--hairline)] sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { l: "Auto-cleared", a: pct(first.stats.autoClearRate), b: pct(last.stats.autoClearRate) },
                  { l: "Cost per close", a: usdFromMicros(first.stats.costMicros), b: usdFromMicros(last.stats.costMicros) },
                  { l: "Controller time", a: minutes(first.touchSeconds), b: minutes(last.touchSeconds) },
                  { l: "Precision held", a: pct(first.stats.autoClearPrecision, 1), b: pct(last.stats.autoClearPrecision, 1) },
                ].map((s) => (
                  <div key={s.l} className="bg-surface-1 p-6">
                    <div className="eyebrow mb-3">{s.l}</div>
                    <div className="nums flex items-baseline gap-2">
                      <span className="text-[15px] text-ink-tertiary line-through decoration-1">{s.a}</span>
                      <span className="text-ink-tertiary">→</span>
                      <span className="text-[28px] font-semibold leading-none tracking-[-0.02em] text-ink">{s.b}</span>
                    </div>
                    <div className="mt-2 text-[12px] text-ink-tertiary">{first.period} → {last.period}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-16 rounded-[var(--radius-xl)] border border-hairline bg-surface-1 p-8">
              <p className="text-[14px] text-ink-subtle">
                No measured run on disk yet. This page shows real numbers or none - run{" "}
                <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[13px] text-ink-muted">npm run simulate</code>{" "}
                to populate it.
              </p>
            </div>
          )}
        </section>

        {/* the insight */}
        <section className="hairline-t bg-surface-1/40">
          <div className="mx-auto w-full max-w-[1240px] px-6 py-20">
            <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <div className="eyebrow mb-4">Why it gets cheaper</div>
                <h2 className="display-md text-ink">Learning that compiles, not learning that accumulates.</h2>
              </div>
              <div className="space-y-5 text-[15px] leading-relaxed text-ink-muted">
                <p>
                  Most agents &ldquo;learn&rdquo; by growing a prompt. Every lesson makes the next call
                  longer, slower and more expensive, and none of it can be audited.
                </p>
                <p>
                  Tickmark turns a correction into a <span className="text-ink">rule</span>: a predicate and
                  an action, versioned, readable, and executable with no model call at all. The month
                  the agent learns that AWS codes to 6820 split 60/25/15, that invoice stops costing
                  anything to decide - forever.
                </p>
                <p>
                  So the cost curve bends the right way. More learning means fewer calls, not bigger
                  ones. And a controller can read the rule, disable it, or ask which corrections
                  taught it - which is the difference between automation an auditor signs off and
                  automation they refuse.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* the loop */}
        <section className="hairline-t">
          <div className="mx-auto w-full max-w-[1240px] px-6 py-20">
            <div className="eyebrow mb-4">The loop</div>
            <h2 className="display-md mb-10 max-w-2xl text-ink">Five steps, and a human owns one of them.</h2>
            <ol className="grid gap-px overflow-hidden rounded-[var(--radius-xl)] border border-hairline bg-[var(--hairline)] md:grid-cols-5">
              {LOOP.map((s, i) => (
                <li key={s.k} className="bg-surface-1 p-5">
                  <div className="nums mb-3 text-[12px] text-ink-tertiary">0{i + 1}</div>
                  <div className="mb-2 text-[14px] font-medium text-ink">{s.k}</div>
                  <p className="text-[13px] leading-snug text-ink-subtle">{s.d}</p>
                </li>
              ))}
            </ol>
            <p className="mt-5 max-w-2xl text-[13px] leading-relaxed text-ink-tertiary">
              Two constraints are borrowed, with credit, from{" "}
              <a className="text-ink-subtle underline decoration-[var(--hairline-strong)] underline-offset-2 hover:text-ink" href="https://github.com/kunchenguid/backpass" target="_blank" rel="noreferrer">backpass</a>:
              a rule needs evidence from at least two distinct corrections, and analysis never
              writes. In accounting those are not niceties - they are traceability and
              segregation of duties.
            </p>
          </div>
        </section>

        {/* workflows */}
        <section className="hairline-t bg-surface-1/40">
          <div className="mx-auto w-full max-w-[1240px] px-6 py-20">
            <div className="eyebrow mb-4">What it actually does</div>
            <h2 className="display-md mb-10 max-w-2xl text-ink">Three steps of the close, end to end.</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {WORK.map((w) => (
                <div key={w.t} className="panel p-6">
                  <h3 className="card-title mb-3 text-ink">{w.t}</h3>
                  <p className="text-[14px] leading-relaxed text-ink-subtle">{w.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* guardrails */}
        <section className="hairline-t">
          <div className="mx-auto w-full max-w-[1240px] px-6 py-20">
            <div className="eyebrow mb-4">Guardrails</div>
            <h2 className="display-md mb-10 max-w-2xl text-ink">The parts that make it usable on real books.</h2>
            <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Materiality is a hard gate", "Nothing above the threshold auto-posts, whatever the confidence. A $12 bank fee and a $2.4M wire do not get the same scrutiny."],
                ["Debits equal credits", "Checked arithmetically in the database, never taken from model output."],
                ["Preparer ≠ approver", "Enforced by a constraint, not a convention."],
                ["Tickmarks are append-only", "You supersede one with a new tickmark. You never edit or delete the record of a verification."],
                ["No rule without a backtest", "A proposed rule is replayed against every closed period, and the controller sees what it would have broken before adopting it."],
                ["Every decision traces", "To a rule and its corrections, or to a close run and its evidence chain. No orphan decisions."],
              ].map(([t, d]) => (
                <div key={t}>
                  <h3 className="mb-2 flex items-start gap-2 text-[14px] font-medium text-ink">
                    <Mark className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--primary)]" />
                    {t}
                  </h3>
                  <p className="text-[13px] leading-relaxed text-ink-subtle">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="hairline-t">
        <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center gap-x-6 gap-y-2 px-6 py-8 text-[12px] text-ink-tertiary">
          <span className="flex items-center gap-1.5"><Mark className="h-3 w-3" /> Tickmark</span>
          <span>Synthetic fixture entity. No real financial data.</span>
          <Link href="/close" className="ml-auto hover:text-ink-subtle">Open the close →</Link>
        </div>
      </footer>
    </div>
  );
}
