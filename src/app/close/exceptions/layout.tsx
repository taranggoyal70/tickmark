import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

/**
 * Only the queue is gated, because only the queue writes: resolving an
 * exception records an attributable Correction and can propose a Rule. The
 * dashboard, the close room and the rulebook are read-only views of a synthetic
 * fixture, so they stay open - a reviewer should not need an account to watch
 * the thing work.
 */
export default async function ExceptionsLayout({ children }: LayoutProps<"/close/exceptions">) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return <>{children}</>;
}
