import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ActionSummary, OP } from "@/components/rule-parts";
import { Logo, Mark } from "@/components/shell";
import { Strip, StripKey, type StripCounts } from "@/components/strip";
import { ThemeToggle } from "@/components/theme-toggle";
import type { PeriodReport } from "@/lib/agent/simulate";
import { latestReport } from "@/lib/report";
import { modelRuns, offlineHeldOut, type CloseSummary } from "@/lib/results";

export const dynamic = "force-dynamic";

// The landing page is the one canonical URL; the root layout sets none, so
// other pages never claim to be this one.
export const metadata: Metadata = { alternates: { canonical: "/" } };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const month = (period: string) => MONTHS[Number(period.slice(5, 7)) - 1] ?? period;
const two = (n: number) => String(n).padStart(2, "0");
/** Truncated, never rounded up: a reported share never flatters itself. */
const share = (n: number, d: number) => (d ? Math.floor((100 * n) / d) : 0);
const k = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString("en-US"));

function countsOf(c: CloseSummary): StripCounts {
  const model = Math.max(0, c.cleared - c.byRule);
  return { rule: c.byRule, model, exception: Math.max(0, c.decisions - c.byRule - model) };
}

function framesOf(p: PeriodReport): StripCounts {
  const f = p.decisions ?? [];
  return {
    rule: f.filter((d) => d.by === "rule" && d.outcome === "tickmark").length,
    model: f.filter((d) => d.by === "agent" && d.outcome === "tickmark").length,
    exception: f.filter((d) => d.outcome === "exception").length,
  };
}

const NAV = [
  { href: "#problem", label: "Problem" },
  { href: "#mechanism", label: "Mechanism" },
  { href: "#close-room", label: "Close room" },
  { href: "#results", label: "Results" },
];

function Section({ id, n, k: key, children }: { id: string; n: string; k: string; children: ReactNode }) {
  return (
    <section id={id} className="sec scroll-mt-[60px] py-[clamp(80px,11vw,140px)]">
      <div className="wrap grid gap-x-10 gap-y-6 md:grid-cols-[minmax(150px,3fr)_minmax(0,9fr)]">
        <div className="flex gap-3 font-mono text-[12px] font-medium leading-none text-ink-2 md:pt-[0.9em]">
          <span className="text-signal">{n}</span>
          <span>{key}</span>
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

function H2({ children, quiet }: { children: ReactNode; quiet?: ReactNode }) {
  return (
    <h2 className="display-lg m-0 max-w-[20ch] text-ink">
      {children}
      {quiet ? <> <span className="text-muted">{quiet}</span></> : null}
    </h2>
  );
}

function Body({ children }: { children: ReactNode }) {
  return <div className="lede mt-7 max-w-[56ch] space-y-4">{children}</div>;
}

/** A small, quiet arrow between a before and an after figure. */
function To() {
  return <span aria-label="to" className="mx-[0.14em] inline-block align-[0.12em] text-[0.55em] tracking-normal text-muted">→</span>;
}

function Ledger({ items }: { items: { t: ReactNode; code?: ReactNode }[] }) {
  return (
    <ol className="ink-rule mt-10 list-none p-0">
      {items.map((it, i) => (
        <li key={i} className="grid grid-cols-[22px_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1.5 border-b border-line py-[18px] sm:grid-cols-[28px_minmax(0,1fr)_auto]">
          <span className="font-mono text-[12px] font-medium text-muted">{two(i + 1)}</span>
          <span className="text-[clamp(17px,1.6vw,21px)] leading-snug tracking-[-0.02em] text-ink">{it.t}</span>
          {it.code ? <code className="col-start-2 font-mono text-[12px] text-muted sm:col-start-3 sm:text-right">{it.code}</code> : null}
        </li>
      ))}
    </ol>
  );
}

function Figure({ n, caption, aside, children, bleed = false }: { n: number; caption: ReactNode; aside?: ReactNode; children: ReactNode; bleed?: boolean }) {
  const cap = (
    <figcaption className="fig-cap">
      <span className="n">Fig. {n}</span>
      <span className="min-w-0 flex-1 basis-64">{caption}</span>
      {aside ? <span className="nums">{aside}</span> : null}
    </figcaption>
  );
  return (
    <figure className="m-0 mt-[clamp(48px,7vw,80px)]">
      <div className="fig-frame">{bleed ? <div className="wrap">{children}</div> : children}</div>
      {bleed ? <div className="wrap">{cap}</div> : cap}
    </figure>
  );
}

/** Six closes, six bars, the latest in signal. Every bar carries its value. */
function Bench({ n, title, unit, values, labels, format = String }: {
  n: number; title: string; unit: string; values: number[]; labels: string[]; format?: (v: number) => string;
}) {
  const max = Math.max(...values, 1);
  const last = values.length - 1;
  return (
    <figure className="m-0 border-b border-r border-line px-3.5 pt-4">
      <figcaption>
        <b className="block text-[15px] font-semibold leading-tight tracking-[-0.02em] text-ink">{title}</b>
        <span className="label mt-1.5 block">Fig. {n} · {unit}</span>
      </figcaption>
      <em className="nums mt-3.5 block text-[clamp(30px,3vw,40px)] font-medium not-italic leading-none tracking-[-0.04em] text-signal">
        {format(values[last])}
      </em>
      <div className="mt-3 grid h-[132px] grid-cols-6 items-end gap-1.5" role="img"
           aria-label={`${title}: ${values.map((v, i) => `${labels[i]} ${format(v)}`).join(", ")}`}>
        {values.map((v, i) => (
          <div key={i} className="flex h-full flex-col justify-end" title={`${labels[i]}: ${format(v)}`}>
            {/* selective direct labels: where it started and where it is now */}
            <span className={`nums pb-1 text-center font-mono text-[10px] ${i === last ? "font-semibold text-signal-ink" : "text-muted"} ${i === 0 || i === last ? "" : "invisible"}`}>{format(v)}</span>
            <i className={`block rounded-t-[2px] ${i === last ? "bg-signal" : "bg-[var(--line-2)]"}`}
               style={{ height: `${Math.max(2, (v / max) * 96)}px` }} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-6 gap-1.5 border-t border-line py-2">
        {labels.map((l) => <span key={l} className="text-center font-mono text-[10px] text-muted">{l}</span>)}
      </div>
    </figure>
  );
}

export default async function Home() {
  const off = offlineHeldOut();
  const runs = modelRuns();
  const report = await latestReport();
  const closes = off.closes;
  const c1 = closes[0];
  const cN = closes[closes.length - 1];
  const cleared = closes.reduce((s, c) => s + c.cleared, 0);
  const clearedWrong = closes.reduce((s, c) => s + c.clearedWrong, 0);
  const labels = closes.map((c) => two(c.close));

  // the mechanism figure shows a real rule from the recorded run, with its evidence
  const rule = report?.rulebook.find((r) => r.status === "active" && r.evidence.length >= 2 && r.backtest);
  const cold = report?.periods[0];
  const trained = report?.periods[report.periods.length - 1];
  const replayable = Boolean(cold?.decisions?.length && trained?.decisions?.length && cold !== trained);

  return (
    <div className="sheet flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-[var(--nav-bg)] backdrop-blur-md backdrop-saturate-150">
        <div className="wrap flex h-[60px] items-center gap-7">
          <Logo />
          <nav aria-label="Page" className="hidden gap-[22px] md:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="font-mono text-[12.5px] font-medium text-muted transition-colors hover:text-ink">{n.label}</a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2.5">
            <ThemeToggle />
            <Link href="/close/run" className="btn btn-sm btn-primary">
              Open the close <span className="arrow">→</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* hero */}
        <section className="relative">
          <div className="wrap pt-[clamp(56px,12vh,140px)]">
            <h1 className="display-xl m-0">
              <span className="split-line"><span className="text-faint" style={{ "--d": "0.05s" } as CSSProperties}>Models guess.</span></span>
              <br />
              <span className="split-line"><span style={{ "--d": "0.3s" } as CSSProperties}>Rules don&rsquo;t.</span></span>
            </h1>
            <div className="rise mt-[clamp(28px,5vh,64px)] flex flex-wrap items-end justify-between gap-x-12 gap-y-6" style={{ "--d": "0.45s" } as CSSProperties}>
              <p className="lede m-0 max-w-[46ch]">
                Tickmark closes the books with an agent, hands the controller only what needs
                judgment, and compiles every correction into a deterministic rule. The judgment
                gets made once. After that it runs for free.
              </p>
              <div className="flex flex-wrap gap-2.5">
                <Link href="/close/run" className="btn btn-primary">Watch it close the books <span className="arrow">→</span></Link>
                <a href="#results" className="btn">Read the results</a>
              </div>
            </div>
          </div>

          <Figure
            n={1}
            bleed
            caption={<>Six month-end closes on {off.companies} companies the rules were never tuned on. One mark per decision.</>}
            aside={<>calls <b className="font-medium text-ink">{c1.modelCalls}</b> → <b className="font-medium text-ink">{cN.modelCalls}</b> · wrong clears <b className="font-medium text-ink">{clearedWrong}</b></>}
          >
            <div className="py-[clamp(24px,4vw,44px)]">
              <div className="mb-5"><StripKey model={closes.some((c) => countsOf(c).model > 0)} /></div>
              <div className="grid gap-2.5">
                {closes.map((c, i) => (
                  <div key={c.close} className="grid grid-cols-[22px_minmax(0,1fr)_34px] items-center gap-3 sm:grid-cols-[76px_minmax(0,1fr)_120px] sm:gap-4">
                    <span className="nums whitespace-nowrap font-mono text-[11.5px] text-muted"><span className="text-ink">{two(c.close)}</span><span className="hidden sm:inline"> · {month(c.period)}</span></span>
                    <Strip counts={countsOf(c)} row={i} label={`Close ${c.close}, ${c.period}`} />
                    <span className="nums text-right font-mono text-[11.5px] text-muted">
                      <b className="font-medium text-ink">{share(c.byRule, c.decisions)}%</b><span className="hidden sm:inline"> by rule</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Figure>
        </section>

        <Section id="problem" n="01" k="The problem">
          <H2 quiet="Every month, from scratch.">Close agents decide the same invoice twice.</H2>
          <Body>
            <p>
              Most finance agents &ldquo;learn&rdquo; by growing a prompt. Every lesson makes the next call
              longer and dearer, none of it can be audited, and next month the same vendor is a fresh
              judgment call that a controller has to check again.
            </p>
          </Body>
          <Ledger items={[
            { t: "The vendor you corrected in January is re-decided in February.", code: "same line, new model call" },
            { t: "Lessons pile into the prompt, so learning makes every call cost more.", code: "tokens grow with corrections" },
            { t: "An auditor cannot read a prompt and sign off on what it will do.", code: "no rule, no evidence" },
          ]} />
        </Section>

        <Section id="mechanism" n="02" k="Mechanism">
          <H2 quiet="Not prompts.">Corrections compile into rules.</H2>
          <Body>
            <p>
              A correction is captured as structure, not prose. When two distinct corrections agree,
              the gradient step proposes a rule: a predicate and an action, replayed against every
              closed period. A controller adopts it or does not. From then on that decision takes no
              model call at all.
            </p>
          </Body>

          {rule ? (
            <Figure
              n={2}
              caption={<>Two corrections in, one rule out. {rule.id} from the recorded run{report?.provenance === "mock" ? " (mechanism test)" : ""}.</>}
              aside={<Link href="/close/rulebook" className="text-ink underline decoration-[var(--line-2)] underline-offset-4 hover:decoration-[var(--ink)]">every rule →</Link>}
            >
              <div className="grid items-center gap-0 px-[clamp(12px,3vw,32px)] py-[clamp(28px,5vw,52px)] md:grid-cols-[minmax(0,1fr)_56px_minmax(0,1.15fr)]">
                <div className="panel-raised p-5">
                  <div className="label mb-3.5 flex justify-between gap-3 border-b border-line pb-3">
                    <span>Corrections</span><span className="normal-case tracking-normal">{rule.evidence.length} distinct</span>
                  </div>
                  <ul className="m-0 grid list-none gap-3 p-0">
                    {rule.evidence.slice(0, 3).map((e) => (
                      <li key={e.correctionId} className="text-[13px] leading-snug text-ink-2">
                        <span className="block font-mono text-[11px] text-muted">{e.periodCode} · {e.subjectRef}</span>
                        <span className="mt-1 block">{e.quote}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div aria-hidden="true" className="relative mx-auto h-8 w-px bg-[var(--line-2)] md:mx-3 md:h-px md:w-auto">
                  <i className="absolute left-[-3px] top-1/2 h-[7px] w-[7px] -translate-y-1/2 bg-signal md:left-auto md:right-0" />
                </div>
                <div className="panel-raised p-5">
                  <div className="label mb-3.5 flex justify-between gap-3 border-b border-line pb-3">
                    <span>Rule · {rule.kind}</span><span className="normal-case tracking-normal text-[var(--ok)]">{rule.status}</span>
                  </div>
                  <div className="text-[15px] font-medium tracking-[-0.015em] text-ink">{rule.name}</div>
                  <dl className="m-0 mt-3 grid grid-cols-[52px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13.5px] text-ink-2">
                    <dt className="font-mono text-[12px] text-muted">when</dt>
                    <dd className="m-0">{rule.predicate.map((p, i) => <span key={i} className="block">{OP[p.op] ?? p.op} <span className="text-ink">{String(p.value)}</span></span>)}</dd>
                    <dt className="font-mono text-[12px] text-muted">then</dt>
                    <dd className="m-0"><ActionSummary rule={rule} /></dd>
                    {rule.backtest ? (
                      <>
                        <dt className="font-mono text-[12px] text-muted">replay</dt>
                        <dd className="nums m-0">
                          fired {rule.backtest.wouldHaveFired}×, wrong <span className="text-ink">{rule.backtest.wouldHaveBeenWrong}</span>,
                          precision <span className="text-ink">{(rule.backtest.precision * 100).toFixed(1)}%</span>
                        </dd>
                      </>
                    ) : null}
                  </dl>
                </div>
              </div>
            </Figure>
          ) : null}

          <Ledger items={[
            { t: <>The <b className="font-medium">rulebook</b> runs first. Rules are the weights.</>, code: "zero tokens" },
            { t: <>The <b className="font-medium">close run</b> sends only the residue to the model.</>, code: "the forward pass" },
            { t: <>The controller&rsquo;s <b className="font-medium">corrections</b> are captured as structure.</>, code: "the loss signal" },
            { t: <>The <b className="font-medium">gradient step</b> proposes rules and replays every closed period.</>, code: "two corrections minimum" },
            { t: <>A <b className="font-medium">human</b> adopts or rejects. Analysis never writes.</>, code: "segregation of duties" },
          ]} />
        </Section>

        <Section id="close-room" n="03" k="Close room">
          <H2 quiet="Before it learned, and after.">Same books, closed twice.</H2>
          <Body>
            <p>
              The close room replays every recorded decision of the first close beside the last one.
              Identical books, identical model. Rules settle instantly; model work and the
              controller&rsquo;s queue are what is left.
            </p>
          </Body>
          {replayable && cold && trained ? (
            <Figure
              n={3}
              caption={<>The recorded run{report?.provenance === "mock" ? ", a mechanism test," : ""} at its first and last close.</>}
              aside={<Link href="/close/run" className="text-ink underline decoration-[var(--line-2)] underline-offset-4 hover:decoration-[var(--ink)]">play it →</Link>}
            >
              <div className="grid gap-8 px-[clamp(12px,3vw,32px)] py-[clamp(24px,4vw,44px)] md:grid-cols-2">
                {[{ p: cold, tag: "A", note: "Before it learned" }, { p: trained, tag: "B", note: `After ${trained.activeRules} rules` }].map(({ p, tag, note }, i) => {
                  const c = framesOf(p);
                  return (
                    <div key={tag} className="min-w-0">
                      <div className="mb-3 flex items-baseline gap-3">
                        <span className="inline-flex items-center gap-2 font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-ink">
                          <b className={`inline-grid h-[18px] w-[18px] place-items-center rounded-[4px] text-[11px] tracking-normal text-[var(--on-ink)] ${i ? "bg-signal" : "bg-[var(--ink)]"}`}>{tag}</b>
                          {p.period}
                        </span>
                        <span className="truncate text-[14px] text-muted">{note}</span>
                      </div>
                      <Strip counts={c} row={i} label={`${p.period}`} />
                      <div className="nums mt-3 grid grid-cols-3 border-t border-line pt-3 font-mono text-[11.5px] text-muted">
                        <span><b className="block font-sans text-[22px] font-medium tracking-[-0.03em] text-ink">{c.rule}</b>by rule</span>
                        <span><b className="block font-sans text-[22px] font-medium tracking-[-0.03em] text-ink">{c.model}</b>by model</span>
                        <span><b className="block font-sans text-[22px] font-medium tracking-[-0.03em] text-signal">{c.exception}</b>for you</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Figure>
          ) : null}
        </Section>

        <Section id="results" n="04" k="Results">
          <H2 quiet={clearedWrong === 0 ? "Not one wrong clear." : `${clearedWrong} wrong clears.`}>Rules up, calls down.</H2>
          <Body>
            <p>
              Six closes in a row on {off.companies} held-out companies, scored against an answer key
              the agent never sees. Nothing reviews what it clears unattended, so those lines are
              checked against the key instead.
            </p>
          </Body>

          <div className="ink-rule mt-10 grid grid-cols-2 xl:grid-cols-4">
            {[
              { v: <>{share(cN.byRule, cN.decisions)}%</>, l: `of decisions settled by rule in close ${two(cN.close)}`, win: true },
              { v: <>{c1.modelCalls}<To />{cN.modelCalls}</>, l: "model calls per close" },
              { v: <>{clearedWrong}<span className="mx-[0.12em] text-muted">/</span>{cleared}</>, l: "unattended clears wrong" },
              { v: <>{c1.exceptions}<To />{cN.exceptions}</>, l: "items for the controller" },
            ].map((s, i) => (
              <div key={s.l} className={`min-w-0 pb-5 pr-4 pt-[18px] ${i % 2 ? "border-l border-line pl-4 sm:pl-5" : ""} ${i >= 2 ? "border-t border-line xl:border-t-0" : ""} ${i === 2 ? "xl:border-l xl:pl-5" : ""}`}>
                <b className={`nums block whitespace-nowrap text-[clamp(28px,3.6vw,48px)] font-medium leading-none tracking-[-0.05em] ${s.win ? "text-signal" : "text-ink"}`}>{s.v}</b>
                <span className="label mt-3 block leading-snug">{s.l}</span>
              </div>
            ))}
          </div>

          <div className="ink-rule mt-12 grid grid-cols-1 border-l border-line sm:grid-cols-2 xl:grid-cols-4">
            <Bench n={4} title="Settled by rule" unit="share of decisions" labels={labels}
              values={closes.map((c) => share(c.byRule, c.decisions))} format={(v) => `${v}%`} />
            <Bench n={5} title="Model calls" unit="close plus gradient" labels={labels}
              values={closes.map((c) => c.modelCalls)} />
            <Bench n={6} title="Tokens" unit="estimated, chars / 4" labels={labels}
              values={closes.map((c) => c.tokens)} format={k} />
            <Bench n={7} title="Controller queue" unit="items for a person" labels={labels}
              values={closes.map((c) => c.exceptions)} />
          </div>
          <p className="mt-5 font-mono text-[12px] leading-relaxed text-muted">
            source: eval/results/offline.json · held-out round 2 · {off.provider}.{" "}
            <code className="text-ink-2">npm run eval -- --check</code> reproduces every number.
          </p>

          {runs.length ? (
            <div className="mt-16">
              <h3 className="m-0 text-[clamp(22px,2vw,28px)] font-medium tracking-[-0.03em] text-ink">With a real model</h3>
              <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-ink-2">
                The same held-out companies, with tokens counted by the provider: a frontier model
                through an API, and a 3B model on a laptop. Both bend the same way, and neither
                clears a line wrong, because only a rule clears unattended.
              </p>
              <div className="ink-rule mt-6 overflow-x-auto">
                <table className="nums w-full min-w-[560px] border-collapse text-[14px]">
                  <thead>
                    <tr className="label text-left">
                      <th className="py-3 pr-4 font-medium">model</th>
                      <th className="py-3 pr-4 text-right font-medium">calls, close 1 → 6</th>
                      <th className="py-3 pr-4 text-right font-medium">tokens, close 1 → 6</th>
                      <th className="py-3 text-right font-medium">unattended clears wrong</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => {
                      const a = r.closes[0], b = r.closes[r.closes.length - 1];
                      const cl = r.closes.reduce((s, c) => s + c.cleared, 0);
                      const wr = r.closes.reduce((s, c) => s + c.clearedWrong, 0);
                      return (
                        <tr key={r.model} className="border-t border-line">
                          <td className="py-3 pr-4 font-mono text-[13px] text-ink">{r.model}</td>
                          <td className="py-3 pr-4 text-right text-ink-2">{a.modelCalls} → <span className="text-ink">{b.modelCalls}</span></td>
                          <td className="py-3 pr-4 text-right text-ink-2">{k(a.tokens)} → <span className="text-ink">{k(b.tokens)}</span></td>
                          <td className="py-3 text-right"><span className={wr ? "text-signal-ink" : "text-ink"}>{wr}</span> <span className="text-muted">of {cl}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </Section>

        <Section id="guardrails" n="05" k="Guardrails">
          <H2 quiet="Not only a demo.">Built for books an auditor reads.</H2>
          <Ledger items={[
            { t: "Materiality is a hard gate. Nothing above it auto-posts.", code: "whatever the confidence" },
            { t: "Debits equal credits, checked arithmetically in the database.", code: "never from model output" },
            { t: "The preparer is never the approver.", code: "a constraint, not a convention" },
            { t: "Tickmarks are append-only. A new one supersedes; none are edited.", code: "the record of a verification" },
            { t: "No rule without a replay against every closed period.", code: "see what it would break" },
            { t: "Every decision traces to a rule and its corrections, or to a close run.", code: "no orphan decisions" },
          ]} />
        </Section>
      </main>

      <footer className="relative overflow-hidden border-t border-line pt-[clamp(72px,10vw,128px)]">
        <div className="wrap flex flex-wrap items-end justify-between gap-7">
          <p className="m-0 text-[clamp(44px,6.4vw,96px)] font-medium leading-[0.95] tracking-[-0.05em]">
            Correct it twice.<br /><span className="text-muted">Never again.</span>
          </p>
          <Link href="/close/run" className="btn btn-primary">Open the close <span className="arrow">→</span></Link>
        </div>
        <div className="wrap mt-[clamp(56px,8vw,96px)] flex flex-wrap justify-between gap-4 border-t border-line pb-6 pt-[18px] font-mono text-[11.5px] text-muted">
          <span className="inline-flex items-center gap-1.5"><Mark className="h-3 w-3 text-signal" /> Tickmark · synthetic books, no real financial data</span>
          <span>
            <Link href="/ao" className="hover:text-ink">built with AO</Link>
            {" · "}
            <a href="https://github.com/taranggoyal70/tickmark" className="hover:text-ink">source</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
