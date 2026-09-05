import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

/**
 * Resource-based auth check. Everything under /close reads ledger data, so the
 * gate sits on the segment that owns that data rather than on a path pattern in
 * middleware.
 */
export default async function CloseLayout({ children }: LayoutProps<"/close">) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return <>{children}</>;
}
