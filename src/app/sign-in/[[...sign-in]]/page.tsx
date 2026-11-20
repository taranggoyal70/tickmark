import { SignIn } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { Mark } from "@/components/shell";
import { authConfigured } from "@/lib/auth";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center gap-8 px-6 py-20">
      <div className="flex items-center gap-2">
        <Mark className="h-5 w-5 text-[var(--primary)]" />
        <span className="text-[16px] font-semibold tracking-[-0.01em]">Tickmark</span>
      </div>
      {authConfigured() ? (
        <SignIn appearance={clerkAppearance} />
      ) : (
        <p className="max-w-sm text-center text-[14px] leading-relaxed text-ink-subtle">
          Sign-in is not configured on this deployment, so it runs read-only. Set the Clerk keys
          in <code>.env.local</code> to enable it.
        </p>
      )}
      <p className="max-w-sm text-center text-[12px] leading-relaxed text-ink-tertiary">
        Resolving an exception records a correction in your name, so the queue needs a
        signed-in user. The results, the close room and the rulebook stay public.
      </p>
    </div>
  );
}
