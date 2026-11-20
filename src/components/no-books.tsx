import Link from "next/link";
import { authConfigured } from "@/lib/auth";
import { queueEnabled } from "@/lib/store/queue";
import { Empty } from "./shell";

const link = "text-ink underline decoration-[var(--line-2)] underline-offset-4";

/**
 * The screens that work on imported books, with none this visitor may see.
 * Says which reason it is, because "import a period" is wrong advice on a
 * deployment with no database, and "sign in" is wrong advice to someone who
 * already has.
 */
export function NoBooks({ view, signedIn }: { view: string; signedIn: boolean }) {
  const elsewhere = (
    <>
      The <Link href="/close" className={link}>results</Link>,{" "}
      the <Link href="/close/run" className={link}>close room</Link> and{" "}
      the <Link href="/close/rulebook" className={link}>rulebook</Link> read the recorded run and work without any.
    </>
  );

  if (!queueEnabled()) {
    return (
      <Empty title="No books on this deployment">
        <p>{view} reads books imported into the database, and this deployment runs without one. {elsewhere}</p>
        <p className="mt-3 font-mono text-[12px]">set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable it</p>
      </Empty>
    );
  }
  if (signedIn) {
    return (
      <Empty title="No books yet">
        <p>{view} needs a period to work on. Import a month from your bank and your ledger; only you can see it.</p>
        <Link href="/setup" className="btn btn-sm btn-primary mt-5">Import a period <span className="arrow">→</span></Link>
      </Empty>
    );
  }
  return (
    <Empty title="Nothing public to show">
      <p>{view} shows books you imported, and this deployment has no public demo books. {elsewhere}</p>
      {authConfigured() ? (
        <Link href="/sign-in" className="btn btn-sm btn-primary mt-5">Sign in to import yours <span className="arrow">→</span></Link>
      ) : null}
    </Empty>
  );
}
