import Link from "next/link";
import type { ReactNode } from "react";

const NAV = [
  { href: "/close", label: "Close" },
  { href: "/close/exceptions", label: "Exceptions" },
  { href: "/close/rulebook", label: "Rulebook" },
];

export function Mark({ className = "" }: { className?: string }) {
  // The tickmark itself: the check an accountant writes beside a verified line.
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      <path d="M3 10.5 L7.5 15.5 L17 4.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Shell({ children, active }: { children: ReactNode; active?: string }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="hairline-b sticky top-0 z-20 bg-[color-mix(in_oklab,var(--canvas)_88%,transparent)] backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1240px] items-center gap-6 px-6">
          <Link href="/" className="focus-ring flex items-center gap-2 rounded">
            <Mark className="h-4 w-4 text-[var(--primary)]" />
            <span className="text-[14px] font-semibold tracking-[-0.01em]">Tickmark</span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`focus-ring rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[13px] transition-colors ${
                  active === n.href ? "bg-surface-3 text-ink" : "text-ink-subtle hover:text-ink"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-[12px] text-ink-tertiary">
            <span className="hidden sm:inline">Northwind Robotics, Inc.</span>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1240px] flex-1 px-6 py-8">{children}</main>
      <footer className="hairline-t mt-16">
        <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center gap-x-6 gap-y-2 px-6 py-6 text-[12px] text-ink-tertiary">
          <span>Tickmark</span>
          <span>Every automated decision traces to a Rule or a Close Run. No orphan decisions.</span>
        </div>
      </footer>
    </div>
  );
}

export function EmptyRun() {
  return (
    <div className="panel p-8 text-center">
      <Mark className="mx-auto h-6 w-6 text-[var(--ink-tertiary)]" />
      <h2 className="card-title mt-4 text-ink">No close run yet</h2>
      <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-ink-subtle">
        The dashboard renders measured results only - nothing here is illustrative.
        Run the harness to populate it:
      </p>
      <pre className="mx-auto mt-4 w-fit rounded-[var(--radius-md)] border border-hairline bg-surface-2 px-3 py-2 text-left font-mono text-[12px] text-ink-muted">
npm run simulate
      </pre>
      <p className="mx-auto mt-3 max-w-md text-[12px] text-ink-tertiary">
        Needs a model credential: either a card on the Vercel AI Gateway, or
        <code className="mx-1 rounded bg-surface-3 px-1 py-0.5 font-mono">ANTHROPIC_API_KEY</code>
        in <code className="rounded bg-surface-3 px-1 py-0.5 font-mono">.env.local</code>.
      </p>
    </div>
  );
}
