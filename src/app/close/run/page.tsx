import type { Metadata } from "next";
import { CloseRoom } from "@/components/close-room";
import { EmptyRun, Shell } from "@/components/shell";
import { ProvenanceBanner } from "@/components/provenance";
import { latestReport } from "@/lib/report";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Close room",
  description:
    "The same books closed twice, before the agent learned anything and after, with every recorded decision replayed in order, side by side.",
};

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

      <div className="mb-10">
        <div className="eyebrow mb-4">The close room</div>
        <h1 className="display-md m-0 text-ink">
          Same books, closed twice.<br />
          <span className="text-muted">Before it learned, and after.</span>
        </h1>
        <p className="lede mt-5 max-w-[60ch]">
          {cold.period} on the left, {trained.period} on the right: identical books, identical model.
          Every recorded decision is replayed in order. Compiled rules settle instantly; model work
          and the controller&rsquo;s queue are what is left. Watch the right-hand queue stay short.
        </p>
      </div>

      <CloseRoom periods={report.periods} />
    </Shell>
  );
}
