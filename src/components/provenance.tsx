import type { SimulationReport } from "@/lib/agent/simulate";

/**
 * Numbers from the mechanism test are not model performance. Say so loudly and
 * in the same place every time, so the two can never be conflated.
 */
export function ProvenanceBanner({ report }: { report: SimulationReport }) {
  const degraded = report.periods.some((p) => p.stats.modelFailures > 0 || p.gradientSkipped);
  if (report.provenance !== "mock" && !degraded) return null;

  const title = report.provenance === "mock" ? "Mechanism test" : "Recorded during an outage";
  const detail = report.provenance === "mock"
    ? <>These figures come from a deterministic stand-in that answers from ground truth. They show the loop is wired,
        not how a real model performs. <code className="font-mono text-[12px] text-ink">npm run simulate</code> records measured numbers.</>
    : <>The Rulebook still ran and every undecided line went to the controller queue, but unavailable model batches and
        gradient steps were skipped. These figures show fail-safe behaviour, not model quality.</>;

  return (
    <div className="mb-8 flex flex-wrap items-baseline gap-x-4 gap-y-1.5 border-y border-line py-3 text-[13px] leading-relaxed">
      <span className="label inline-flex shrink-0 items-center gap-2 text-ink">
        <span aria-hidden="true" className="inline-block h-1.5 w-1.5 bg-signal" />
        {title}
      </span>
      <span className="min-w-0 flex-1 basis-80 text-muted">{detail}</span>
    </div>
  );
}
