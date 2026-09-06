import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { ImportForm } from "./import-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <Shell active="/setup">
      <div className="mb-6 max-w-2xl">
        <div className="eyebrow mb-2">Import</div>
        <h1 className="headline text-ink">Bring your own books</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-subtle">
          Export a month from your bank and your bookkeeping system and drop the files here.
          Rows that cannot be read are listed with their line number and reason rather than
          quietly dropped — a missing line is a reconciling difference someone chases for an hour.
        </p>
      </div>
      <ImportForm />
    </Shell>
  );
}
