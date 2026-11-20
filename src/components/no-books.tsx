import Link from "next/link";
import { queueEnabled } from "@/lib/store/queue";
import { Empty } from "./shell";

/**
 * The screens that work on imported books, with none to work on. Says which
 * of the two reasons it is, because "import a period" is wrong advice on a
 * deployment that has no database to import into.
 */
export function NoBooks({ view }: { view: string }) {
  if (!queueEnabled()) {
    return (
      <Empty title="No books on this deployment">
        <p>
          {view} reads books imported into the database, and this deployment runs without one.
          The <Link href="/close" className="text-ink underline decoration-[var(--line-2)] underline-offset-4">results</Link>,{" "}
          the <Link href="/close/run" className="text-ink underline decoration-[var(--line-2)] underline-offset-4">close room</Link> and{" "}
          the <Link href="/close/rulebook" className="text-ink underline decoration-[var(--line-2)] underline-offset-4">rulebook</Link> read
          the recorded run and work here.
        </p>
        <p className="mt-3 font-mono text-[12px]">set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable it</p>
      </Empty>
    );
  }
  return (
    <Empty title="No books yet">
      <p>{view} needs a period to work on.</p>
      <Link href="/setup" className="btn btn-sm btn-primary mt-5">Import a period <span className="arrow">→</span></Link>
    </Empty>
  );
}
