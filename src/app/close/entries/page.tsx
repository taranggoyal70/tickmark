import { Panel } from "@/components/kit";
import { NoBooks } from "@/components/no-books";
import { Shell } from "@/components/shell";
import { booksFor } from "@/lib/access";
import { signedInUserId } from "@/lib/auth";
import { listEntries } from "@/lib/store/entries";
import { queueEnabled } from "@/lib/store/queue";
import { EntryCard } from "./entry-list";

export const dynamic = "force-dynamic";

export default async function EntriesPage() {
  const userId = await signedInUserId();
  const books = queueEnabled() ? await booksFor(userId) : [];
  if (!books.length) {
    return <Shell active="/close/entries"><NoBooks view="The journal entry approval queue" signedIn={Boolean(userId)} /></Shell>;
  }

  // read what the viewer may read; approve only on books they are a member of
  const readable = books.map((b) => b.id);
  const mine = new Set(books.filter((b) => b.member).map((b) => b.id));
  const [pending, posted] = await Promise.all([
    listEntries(readable, "pending_approval"),
    listEntries(readable, "posted"),
  ]);
  const several = books.length > 1;

  return (
    <Shell active="/close/entries">
      <div className="mb-8 max-w-2xl">
        <div className="eyebrow mb-4">Journal entries</div>
        <h1 className="display-md m-0 text-ink">
          {pending.length ? `${pending.length} ${pending.length === 1 ? "entry" : "entries"} waiting for approval` : "Nothing waiting for approval"}
        </h1>
        <p className="lede mt-4">
          The agent drafts entries; it never posts them. Debits must equal credits, checked
          arithmetically by the database, not taken from the model, and the approver has to be
          someone other than the preparer.
        </p>
        <p className="mt-3 font-mono text-[12px] text-muted">
          Showing each company&rsquo;s latest close run, so a rerun never duplicates the approval queue.
        </p>
      </div>

      {pending.length ? (
        <div className="space-y-3">
          {pending.map((e) => (
            <EntryCard key={e.id} entry={e} canDecide={mine.has(e.entityId)} showEntity={several} signedIn={Boolean(userId)} />
          ))}
        </div>
      ) : (
        <Panel className="p-8 text-center">
          <h2 className="card-title text-ink">No drafts</h2>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted">
            Accruals appear here after a close finds a recurring cost that was incurred but never invoiced.
          </p>
        </Panel>
      )}

      {posted.length ? (
        <div className="mt-10">
          <h2 className="label mb-3">{posted.length} posted</h2>
          <Panel className="divide-y divide-[var(--line)]">
            {posted.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
                <span className="text-ink-2">{several ? <span className="text-muted">{e.entity} · </span> : null}{e.memo}</span>
                <span className="nums font-mono text-[12px] text-muted">{e.periodCode} · posted</span>
              </div>
            ))}
          </Panel>
        </div>
      ) : null}
    </Shell>
  );
}
