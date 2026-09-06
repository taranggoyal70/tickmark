import { CloseRoom } from "@/components/close-room";
import { EmptyRun, Shell } from "@/components/shell";
import { ProvenanceBanner } from "@/components/provenance";
import { latestReport } from "@/lib/report";

export const dynamic = "force-dynamic";

export default async function CloseRoomPage() {
  const report = await latestReport();
  // a report written before decision frames existed cannot be replayed
  const replayable = report && report.periods.length >= 2 && report.periods.every((p) => p.decisions?.length);
  if (!replayable) return <Shell active="/close/run"><EmptyRun /></Shell>;

  const cold = report.periods[0];
  const trained = report.periods[report.periods.length - 1];

  return (
    <Shell active="/close/run">
      <ProvenanceBanner report={report} />

      <div className="mb-6">
        <div className="eyebrow mb-2">The close room</div>
        <h1 className="display-md text-ink">
          Watch the same close, twice.<br />
          <span className="text-ink-subtle">Before it learned anything, and after.</span>
        </h1>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-subtle">
          {cold.period} on the left, {trained.period} on the right — identical books, identical model.
          Every decision is replayed from a recorded run at the speed it actually costs: a compiled rule
          is a predicate check, a model call is not. Watch the right-hand queue stay short.
        </p>
      </div>

      <CloseRoom periods={report.periods} />
    </Shell>
  );
}
