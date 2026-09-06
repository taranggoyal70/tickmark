import { Badge, Panel } from "@/components/kit";
import { EmptyRun, Shell } from "@/components/shell";
import { ProvenanceBanner } from "@/components/provenance";
import { latestReport } from "@/lib/report";
import { listIntents, listQueue } from "@/lib/store/queue";
import { QueueRow } from "./queue-client";

export const dynamic = "force-dynamic";

const CAUSE_LABEL: Record<string, string> = {
  over_materiality: "Over materiality", low_confidence: "Low confidence",
  policy_requires_human: "Policy", no_candidate: "No match found",
  ambiguous_candidates: "Ambiguous",
};
const CAUSE_BADGE: Record<string, string> = {
  over_materiality: "warn", low_confidence: "bad", policy_requires_human: "human",
  no_candidate: "neutral", ambiguous_candidates: "warn",
};

export default async function ExceptionsPage() {
  const [report, queue, intents] = await Promise.all([latestReport(), listQueue(), listIntents()]);
  if (!report) return <Shell active="/close/exceptions"><EmptyRun /></Shell>;

  const first = report.periods[0];
  const items = queue?.items ?? [];
  const byCause = items.reduce<Record<string, number>>((a, e) => ({ ...a, [e.cause]: (a[e.cause] ?? 0) + 1 }), {});
  const openIntents = intents.filter((i) => i.status === "open");

  return (
    <Shell active="/close/exceptions">
      <ProvenanceBanner report={report} />

      <div className="mb-6">
        <div className="eyebrow mb-2">Exception queue · {queue?.periodCode || report.periods[report.periods.length - 1].period}</div>
        <h1 className="headline text-ink">
          {items.length ? `${items.length} items need judgment` : "Queue is clear"}
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-subtle">
          Down from {first.exceptions?.length ?? first.stats.exceptionsOpened} in {first.period}. An exception is not an
          error — it is the agent correctly declining to assert something. Resolve one, and tick
          <span className="text-ink"> &ldquo;always do this&rdquo;</span> to turn the judgment into standing policy.
          It takes two agreeing corrections before anything becomes a rule.
        </p>
      </div>

      {items.length ? (
        <div className="mb-6 flex flex-wrap gap-2">
          {Object.entries(byCause).map(([cause, n]) => (
            <Badge key={cause} kind={CAUSE_BADGE[cause] ?? "neutral"}>{CAUSE_LABEL[cause] ?? cause} · {n}</Badge>
          ))}
        </div>
      ) : null}

      {openIntents.length ? (
        <Panel className="mb-6 p-4">
          <div className="eyebrow mb-2">Standing intents · waiting for a second correction</div>
          <ul className="flex flex-wrap gap-2">
            {openIntents.map((i) => (
              <li key={i.id} className="rounded-[var(--radius-sm)] border border-[#fab219]/45 bg-[#fab219]/12 px-2.5 py-1 text-[12px] text-ink-muted">
                <span className="text-ink">{Object.values(i.scope).join(" ")}</span>
                <span className="text-ink-tertiary"> · {i.kind}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[12px] leading-snug text-ink-tertiary">
            These are instructions, not rules. Nothing here decides anything until a second correction agrees with it —
            that is the evidence gate, and it is enforced in the database, not just described here.
          </p>
        </Panel>
      ) : null}

      {items.length === 0 ? (
        <Panel className="p-8 text-center">
          <h2 className="card-title text-ink">Nothing waiting</h2>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-ink-subtle">
            {queue === null
              ? <>The live queue needs Supabase credentials. Run <code className="rounded bg-surface-3 px-1 py-0.5 font-mono">npm run publish</code> once a run exists to open a period for review.</>
              : "Everything in this period was settled by a rule or cleared within policy."}
          </p>
        </Panel>
      ) : (
        <div className="space-y-2">
          {items.map((item) => <QueueRow key={item.id} item={item} />)}
        </div>
      )}
    </Shell>
  );
}
