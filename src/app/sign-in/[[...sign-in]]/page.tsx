import type { Metadata } from "next";
import { ThemedSignIn } from "@/components/clerk-themed";
import { Mark } from "@/components/shell";
import { authConfigured } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main id="main" className="flex min-h-screen flex-1 flex-col items-center justify-center gap-8 px-6 py-20">
      <div className="flex items-center gap-2">
        <Mark className="h-5 w-5 text-signal" />
        <span className="text-[17px] font-semibold tracking-[-0.02em]">Tickmark</span>
      </div>
      {authConfigured() ? (
        <ThemedSignIn />
      ) : (
        <p className="max-w-sm text-center text-[14px] leading-relaxed text-ink-subtle">
          Sign-in is not configured on this deployment, so it runs read-only. Set the Clerk keys
          in <code>.env.local</code> to enable it.
        </p>
      )}
      <p className="max-w-sm text-center text-[12px] leading-relaxed text-ink-tertiary">
        Sign in to import your own books and work their exception queue. What you import is
        visible only to you. The demo company&rsquo;s results, close room and rulebook stay public.
      </p>
    </main>
  );
}
