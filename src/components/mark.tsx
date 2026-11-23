import Link from "next/link";

/**
 * The brand, with no server dependencies, so client components such as the
 * error pages can draw it too. src/app/icon.svg and the share card use the
 * same path.
 */
export function Mark({ className = "" }: { className?: string }) {
  // The tickmark itself: the check an accountant writes beside a verified line.
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      <path d="M3 10.5 L7.5 15.5 L17 4.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The wordmark: the check in signal, the name in ink. */
export function Logo() {
  return (
    <Link href="/" className="focus-ring flex shrink-0 items-center gap-2 rounded">
      <Mark className="h-[15px] w-[15px] text-signal" />
      <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink">Tickmark</span>
    </Link>
  );
}
