import { SignIn } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { Mark } from "@/components/shell";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center gap-8 px-6 py-20">
      <div className="flex items-center gap-2">
        <Mark className="h-5 w-5 text-[var(--primary)]" />
        <span className="text-[16px] font-semibold tracking-[-0.01em]">Tickmark</span>
      </div>
      <SignIn appearance={clerkAppearance} />
      <p className="max-w-sm text-center text-[12px] leading-relaxed text-ink-tertiary">
        The close workbench reads ledger data, so it needs a signed-in user.
        The marketing page stays public.
      </p>
    </div>
  );
}
