import { SignUp } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { Mark } from "@/components/shell";

export default function SignUpPage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-8 px-6 py-20">
      <div className="flex items-center gap-2">
        <Mark className="h-5 w-5 text-[var(--primary)]" />
        <span className="text-[16px] font-semibold tracking-[-0.01em]">Tickmark</span>
      </div>
      <SignUp appearance={clerkAppearance} />
    </div>
  );
}
