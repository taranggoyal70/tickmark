import Link from "next/link";
import { authConfigured, signedInUserId } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Empty, Shell } from "@/components/shell";
import { ImportForm } from "./import-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  // read-only deployment: explain in place rather than bounce to a sign-in
  // page that cannot sign anyone in
  if (!authConfigured()) {
    return (
      <Shell active="/setup">
        <Empty title="Importing needs a signed-in controller">
          <p>
            Imported books belong to whoever imported them, so the import is behind sign-in, and this
            deployment runs read-only without it. The <Link href="/close" className="text-ink underline decoration-[var(--line-2)] underline-offset-4">results</Link> and
            the <Link href="/close/run" className="text-ink underline decoration-[var(--line-2)] underline-offset-4">close room</Link> run
            on the bundled sample company.
          </p>
          <p className="mt-3 font-mono text-[12px]">set the Clerk keys in .env.local to enable it</p>
        </Empty>
      </Shell>
    );
  }
  const userId = await signedInUserId();
  if (!userId) redirect("/sign-in");

  return (
    <Shell active="/setup">
      <div className="mb-6 max-w-2xl">
        <div className="eyebrow mb-4">Import</div>
        <h1 className="display-md m-0 text-ink">Bring your own books</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-subtle">
          Export a month from your bank and your bookkeeping system and drop the files here.
          Rows that cannot be read are listed with their line number and reason rather than
          quietly dropped: a missing line is a reconciling difference someone chases for an hour.
        </p>
      </div>
      <ImportForm />
    </Shell>
  );
}
