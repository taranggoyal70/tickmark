import type { Metadata } from "next";
import { ThemedSignUp } from "@/components/clerk-themed";
import { Mark } from "@/components/shell";
import { authConfigured } from "@/lib/auth";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <main id="main" className="flex min-h-screen flex-1 flex-col items-center justify-center gap-8 px-6 py-20">
      <div className="flex items-center gap-2">
        <Mark className="h-5 w-5 text-signal" />
        <span className="text-[17px] font-semibold tracking-[-0.02em]">Tickmark</span>
      </div>
      {authConfigured() ? (
        <ThemedSignUp />
      ) : (
        <p className="max-w-sm text-center text-[14px] leading-relaxed text-ink-subtle">
          Sign-in is not configured on this deployment, so it runs read-only. Set the Clerk keys
          in <code>.env.local</code> to enable it.
        </p>
      )}
    </main>
  );
}
