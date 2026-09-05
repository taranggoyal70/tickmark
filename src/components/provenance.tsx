import type { SimulationReport } from "@/lib/agent/simulate";

/**
 * Numbers from the mechanism test are not model performance. Say so loudly and
 * in the same place every time, so the two can never be conflated.
 */
export function ProvenanceBanner({ report }: { report: SimulationReport }) {
  if (report.provenance !== "mock") return null;
  return (
    <div className="mb-6 rounded-[var(--radius-lg)] border border-[var(--warning)]/35 bg-[var(--warning)]/8 px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px]">
        <span className="font-medium text-[#f5cc6b]">Mechanism test, not a measured result.</span>
        <span className="text-ink-muted">
          These figures came from a deterministic stand-in that answers from ground truth — they show the loop is wired,
          not how a real model performs. Run <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[12px]">npm run simulate</code> for measured numbers.
        </span>
      </div>
    </div>
  );
}
