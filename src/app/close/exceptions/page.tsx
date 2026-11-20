import Link from "next/link";
import { Badge, Panel } from "@/components/kit";
import { Empty, Shell } from "@/components/shell";
import { booksFor } from "@/lib/access";
import { signedInUserId } from "@/lib/auth";
import { listIntents, listQueue, queueEnabled } from "@/lib/store/queue";
import { QueueRow } from "./queue-client";

export const dynamic = "force-dynamic";

const CAUSE_LABEL: Record<string, string> = {
  over_materiality: "Over materiality", low_confidence: "Low confidence",
  policy_requires_human: "Policy", no_candidate: "No match found",
  unverified_model_judgment: "Needs human evidence",
  ambiguous_candidates: "Ambiguous",
  model_unavailable: "Model unavailable", audit_sample: "Audit sample",
};
const CAUSE_BADGE: Record<string, string> = {
  over_materiality: "warn", low_confidence: "bad", policy_requires_human: "human",
  unverified_model_judgment: "human",
  no_candidate: "neutral", ambiguous_candidates: "warn",
  model_unavailable: "warn", audit_sample: "human",
};

const link = "text-ink underline decoration-[var(--line-2)] underline-offset-4";

/**
 * The signed-in controller's own queue: open exceptions on books they are a
 * member of. The layout has already required a signed-in user.
 */
export default async function ExceptionsPage() {
  const userId = await signedInUserId();
  if (!queueEnabled()) {
    return (
      <Shell active="/close/exceptions">
        <Empty title="The queue needs a database">
          <p>
            Exceptions are rows in the system of record, and this deployment runs without one. The{" "}
            <Link href="/close/run" className={link}>close room</Link> replays every item the recorded run held.
          </p>
          <p className="mt-3 font-mono text-[12px]">set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable it</p>
        </Empty>
      </Shell>
    );
  }

  const mine = (await booksFor(userId)).filter((b) => b.member);
  if (!mine.length) {
    return (
      <Shell active="/close/exceptions">
        <Empty title="No books of yours yet">
          <p>
            The queue holds what a close of your books could not settle on its own. Import a period
            and run a close, and anything that needs your judgment lands here. To see one worked
            first, the <Link href="/close/run" className={link}>close room</Link> replays the demo company.
          </p>
          <Link href="/setup" className="btn btn-sm btn-primary mt-5">Import a period <span className="arrow">→</span></Link>
        </Empty>
      </Shell>
    );
  }

  const scope = mine.map((b) => b.id);
  const [queue, intents] = await Promise.all([listQueue(scope), listIntents(scope)]);
  const items = queue?.items ?? [];
  const byCause = items.reduce<Record<string, number>>((a, e) => ({ ...a, [e.cause]: (a[e.cause] ?? 0) + 1 }), {});
  const openIntents = intents.filter((i) => i.status === "open");
  const several = mine.length > 1;

  return (
    <Shell active="/close/exceptions">
      <div className="mb-8 max-w-2xl">
        <div className="eyebrow mb-4">
          Exception queue{several ? "" : ` · ${mine[0].name}`}{queue?.periodCode ? ` · ${queue.periodCode}` : ""}
        </div>
        <h1 className="display-md m-0 text-ink">
          {items.length ? `${items.length} ${items.length === 1 ? "item needs" : "items need"} judgment` : "Queue is clear"}
        </h1>
        <p className="lede mt-4">
          An exception is not an error; it is the agent correctly declining to assert something.
          Resolve one, and tick <span className="text-ink">&ldquo;always do this&rdquo;</span> to turn the
          judgment into standing policy. It takes two agreeing corrections before anything becomes a rule.
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
        <Panel className="mb-6 p-5">
          <div className="eyebrow mb-4">Standing intents · waiting for a second correction</div>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {openIntents.map((i) => (
              <li key={i.id} className="rounded-[var(--radius-sm)] border border-[var(--signal)]/30 bg-[var(--signal-bg)] px-2.5 py-1 text-[12px] text-ink-2">
                <span className="text-ink">{Object.values(i.scope).join(" ")}</span>
                <span className="text-muted"> · {i.kind}</span>
              </li>
            ))}
          </ul>
          <p className="m-0 mt-3 text-[12px] leading-snug text-muted">
            These are instructions, not rules. Nothing here decides anything until a second correction agrees with it.
            That is the evidence gate, and it is enforced in the database, not just described here.
          </p>
        </Panel>
      ) : null}

      {items.length === 0 ? (
        <Panel className="p-8 text-center">
          <h2 className="card-title text-ink">Nothing waiting</h2>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted">
            Nothing is open. Items land here when a close of your books holds something back for a
            person; run one from the <Link href="/close" className={link}>close page</Link>.
          </p>
        </Panel>
      ) : (
        <div className="space-y-2">
          {items.map((item) => <QueueRow key={item.id} item={item} showEntity={several} />)}
        </div>
      )}
    </Shell>
  );
}
