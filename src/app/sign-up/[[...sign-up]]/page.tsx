import { SignUp } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { Mark } from "@/components/shell";
import { authConfigured } from "@/lib/auth";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center gap-8 px-6 py-20">
      <div className="flex items-center gap-2">
        <Mark className="h-5 w-5 text-[var(--primary)]" />
        <span className="text-[16px] font-semibold tracking-[-0.01em]">Tickmark</span>
      </div>
      {authConfigured() ? (
        <SignUp appearance={clerkAppearance} />
      ) : (
        <p className="max-w-sm text-center text-[14px] leading-relaxed text-ink-subtle">
          Sign-in is not configured on this deployment, so it runs read-only. Set the Clerk keys
          in <code>.env.local</code> to enable it.
        </p>
      )}
    </div>
  );
}
