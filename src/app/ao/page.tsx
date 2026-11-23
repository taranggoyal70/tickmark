import type { Metadata } from "next";
import Link from "next/link";
import { Mark, Shell } from "@/components/shell";

export const metadata: Metadata = {
  title: "Built with AO",
  description:
    "How Tickmark used AO sessions, isolated worktrees, and orchestrated review to build and verify a finance agent.",
};

const BUILD_LEDGER = [
  {
    phase: "Plan",
    owner: "Orchestrator",
    detail: "Split the release into bounded workstreams with explicit outputs and verification criteria.",
    impact: "The finance controls, product experience, deployment, and audit could move forward without losing one release story.",
  },
  {
    phase: "Build",
    owner: "Workers",
    detail: "Worked in isolated worktrees on audit, hardening, evaluation, deployment, and integration.",
    impact: "Each change stayed inspectable on its own instead of colliding with unrelated work in the main checkout.",
  },
  {
    phase: "Review",
    owner: "Independent sessions",
    detail: "Checked failure behavior, accounting invariants, browser flows, and release evidence as separate concerns.",
    impact: "Problems such as duplicate rerun data and missing rule lineage surfaced before they reached the final demo.",
  },
  {
    phase: "Integrate",
    owner: "Release session",
    detail: "Reconciled the selected work, reran the verification story, and carried the audited build to Vercel.",
    impact: "The shipped product reflects reviewed outputs, not an automatic merge of every session result.",
  },
];

const IMPACT = [
  ["Parallel without chaos", "AO let focused sessions work concurrently while isolated worktrees kept their changes independent."],
  ["Evidence before confidence", "Audit and verification ran as first-class workstreams, so claims had to survive tests and browser evidence."],
  ["Human-controlled integration", "The orchestrator coordinated the work; the release session still decided what belonged in the product."],
  ["A traceable build story", "The session ledger shows how planning, implementation, review, and deployment connected."],
];

export default function AoPage() {
  return (
    <Shell active="/ao">
      <section className="py-8 sm:py-14">
        <div className="grid items-end gap-10 lg:grid-cols-[1fr_22rem]">
          <div className="max-w-3xl">
            <div className="eyebrow mb-4">Build provenance · AO</div>
            <h1 className="display-lg text-ink">
              The agent was built<br />
              <span className="text-ink-subtle">like the close it runs.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-ink-muted">
              Work was divided, checked independently, and brought back through one controlled
              release. AO gave Tickmark parallel execution without giving up review.
            </p>
          </div>

          <div className="panel overflow-hidden">
            <div className="bg-surface-1 p-5">
              <div className="eyebrow mb-3">Point-in-time session ledger</div>
              <div className="nums text-[64px] font-light leading-none tracking-[-0.05em] text-ink">23</div>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-subtle">
                total AO sessions across workers, orchestrators, and terminated runs at final integration.
              </p>
            </div>
            <div className="hairline-t px-5 py-4 font-mono text-[11px] leading-relaxed text-ink-tertiary">
              ao session ls --project tickmark<br />--all --include-terminated
            </div>
          </div>
        </div>
      </section>

      <section className="hairline-t py-14 sm:py-20">
        <div className="mb-8 max-w-2xl">
          <div className="eyebrow mb-3">How AO was used</div>
          <h2 className="display-md text-ink">A build ledger, not a session count.</h2>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-subtle">
            The 23-session total is evidence of the workflow. It is not a claim that every session
            produced a distinct feature.
          </p>
        </div>

        <ol className="overflow-hidden rounded-[var(--radius-xl)] border border-hairline">
          {BUILD_LEDGER.map((item, index) => (
            <li key={item.phase} className="grid gap-4 border-b border-hairline p-5 last:border-b-0 sm:grid-cols-[4rem_8rem_1fr] sm:p-6 lg:grid-cols-[4rem_9rem_1fr_1fr]">
              <div className="nums text-[12px] text-ink-tertiary">0{index + 1}</div>
              <div>
                <div className="text-[15px] font-medium text-ink">{item.phase}</div>
                <div className="mt-1 text-[11px] text-ink-tertiary">{item.owner}</div>
              </div>
              <p className="text-[13px] leading-relaxed text-ink-muted">{item.detail}</p>
              <p className="text-[13px] leading-relaxed text-ink-subtle sm:col-start-3 lg:col-start-auto">
                <span className="font-medium text-ink">Impact: </span>{item.impact}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="hairline-t bg-surface-1/40 py-14 sm:py-20">
        <div className="mb-8">
          <div className="eyebrow mb-3">What changed because of it</div>
          <h2 className="display-md max-w-2xl text-ink">AO made the build process match the product’s control model.</h2>
        </div>
        <div className="grid gap-px overflow-hidden rounded-[var(--radius-xl)] border border-hairline bg-[var(--hairline)] sm:grid-cols-2">
          {IMPACT.map(([title, body]) => (
            <div key={title} className="bg-surface-1 p-6 sm:p-8">
              <h3 className="flex items-start gap-2 text-[15px] font-medium text-ink">
                <Mark className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
                {title}
              </h3>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-subtle">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="hairline-t py-14 sm:py-20">
        <div className="panel flex flex-col items-start justify-between gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
          <div>
            <div className="eyebrow mb-2">Result</div>
            <h2 className="card-title text-ink">One release story, independently checked.</h2>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-subtle">
              AO coordinated the build. Tickmark’s tests, controls, and recorded product behavior
              determine what the release is allowed to claim.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <a href="https://aoagents.dev/" target="_blank" rel="noreferrer" className="focus-ring rounded-[var(--radius-md)] border border-hairline bg-surface-1 px-4 py-2.5 text-[13px] font-medium text-ink hover:bg-surface-3">
              Visit AO
            </a>
            <Link href="/close/run" className="focus-ring rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2.5 text-[13px] font-medium text-[var(--on-primary)] hover:bg-[var(--primary-hover)]">
              Watch the result
            </Link>
          </div>
        </div>
      </section>
    </Shell>
  );
}
