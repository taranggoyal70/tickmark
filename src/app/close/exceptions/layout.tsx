import Link from "next/link";
import { Empty, Shell } from "@/components/shell";
import { authConfigured, signedInUserId } from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * Only the queue is gated, because only the queue writes: resolving an
 * exception records an attributable Correction and can propose a Rule. The
 * dashboard, the close room and the rulebook are read-only views of a synthetic
 * fixture, so they stay open - a reviewer should not need an account to watch
 * the thing work.
 */
export default async function ExceptionsLayout({ children }: LayoutProps<"/close/exceptions">) {
  // Read-only deployment: nobody can sign in, so explain instead of bouncing
  // the visitor to a sign-in page that cannot sign them in.
  if (!authConfigured()) {
    return (
      <Shell active="/close/exceptions">
        <Empty title="The queue needs a signed-in controller">
          <p>
            Resolving an exception records a correction in a person&rsquo;s name and can propose a
            rule, so the queue is behind sign-in, and this deployment runs read-only without it.
            The <Link href="/close/run" className="text-ink underline decoration-[var(--line-2)] underline-offset-4">close room</Link> replays
            every item it would have held.
          </p>
          <p className="mt-3 font-mono text-[12px]">set the Clerk keys in .env.local to enable it</p>
        </Empty>
      </Shell>
    );
  }
  const userId = await signedInUserId();
  if (!userId) redirect("/sign-in");
  return <>{children}</>;
}
