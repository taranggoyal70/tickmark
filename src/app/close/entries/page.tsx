import { Panel } from "@/components/kit";
import { Shell } from "@/components/shell";
import { listEntries } from "@/lib/store/entries";
import { queueEnabled } from "@/lib/store/queue";
import { EntryCard } from "./entry-list";

export const dynamic = "force-dynamic";

export default async function EntriesPage() {
  const pending = queueEnabled() ? await listEntries("pending_approval").catch(() => []) : [];
  const posted = queueEnabled() ? await listEntries("posted").catch(() => []) : [];

  return (
    <Shell active="/close/entries">
      <div className="mb-6 max-w-2xl">
        <div className="eyebrow mb-2">Journal entries</div>
        <h1 className="headline text-ink">
          {pending.length ? `${pending.length} ${pending.length === 1 ? "entry" : "entries"} waiting for approval` : "Nothing waiting for approval"}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-subtle">
          The agent drafts entries; it never posts them. Debits must equal credits — checked
          arithmetically by the database, not taken from the model — and the approver has to be
          someone other than the preparer.
        </p>
      </div>

      {pending.length ? (
        <div className="space-y-3">{pending.map((e) => <EntryCard key={e.id} entry={e} />)}</div>
      ) : (
        <Panel className="p-8 text-center">
          <h2 className="card-title text-ink">No drafts</h2>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-ink-subtle">
            Accruals appear here after a close finds a recurring cost that was incurred but never invoiced.
          </p>
        </Panel>
      )}

      {posted.length ? (
        <div className="mt-8">
          <h2 className="mb-3 text-[15px] font-medium text-ink">{posted.length} posted</h2>
          <Panel className="divide-y divide-[var(--hairline)]">
            {posted.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
                <span className="text-ink-muted">{e.memo}</span>
                <span className="nums text-[12px] text-ink-tertiary">{e.periodCode} · posted</span>
              </div>
            ))}
          </Panel>
        </div>
      ) : null}
    </Shell>
  );
}
