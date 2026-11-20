import { ThemedUserButton } from "./clerk-themed";
import Link from "next/link";
import { authConfigured } from "@/lib/auth";
import { ThemeToggle } from "./theme-toggle";
import type { ReactNode } from "react";

const NAV = [
  { href: "/close", label: "Close" },
  { href: "/close/run", label: "Close room" },
  { href: "/close/exceptions", label: "Exceptions" },
  { href: "/close/reconciliation", label: "Reconciliation" },
  { href: "/close/cash", label: "Cash" },
  { href: "/close/entries", label: "Entries" },
  { href: "/close/rulebook", label: "Rulebook" },
  { href: "/close/binder", label: "Binder" },
  { href: "/ao", label: "AO build" },
  { href: "/setup", label: "Import" },
];

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

function NavLink({ href, label, active, block = false }: { href: string; label: string; active: boolean; block?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`focus-ring relative font-mono text-[12.5px] font-medium transition-colors ${
        block ? "rounded-[var(--radius-sm)] px-2.5 py-2" : "py-1"
      } ${active ? "text-ink" : "text-muted hover:text-ink"}`}
    >
      {label}
      {active && !block ? (
        <span aria-hidden="true" className="absolute -bottom-[9px] left-1/2 h-1 w-1 -translate-x-1/2 bg-signal" />
      ) : null}
    </Link>
  );
}

export function Shell({ children, active }: { children: ReactNode; active?: string }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-[var(--nav-bg)] backdrop-blur-md backdrop-saturate-150">
        <div className="wrap flex h-[60px] items-center gap-7">
          <Logo />
          <nav aria-label="Close workspace" className="hidden items-center gap-[18px] min-[1180px]:flex">
            {NAV.map((n) => <NavLink key={n.href} {...n} active={active === n.href} />)}
          </nav>
          <div className="ml-auto flex items-center gap-2.5">
            <ThemeToggle />
            {authConfigured() ? <ThemedUserButton /> : null}
            <details className="relative min-[1180px]:hidden">
              <summary className="btn btn-sm cursor-pointer list-none marker:content-none">Menu</summary>
              <nav aria-label="Close workspace" className="panel-raised absolute right-0 top-11 flex w-56 flex-col gap-0.5 p-2">
                <div className="label px-2.5 pt-1.5 pb-2 leading-snug">Northwind Robotics · synthetic books</div>
                {NAV.map((n) => <NavLink key={n.href} {...n} active={active === n.href} block />)}
              </nav>
            </details>
          </div>
        </div>
      </header>
      <main className="wrap flex-1 py-8 sm:py-12">{children}</main>
      <footer className="mt-16 border-t border-line">
        <div className="wrap flex flex-wrap justify-between gap-x-6 gap-y-2 py-6 font-mono text-[11.5px] text-muted">
          <span>Tickmark · every automated decision traces to a rule or a close run</span>
          <span>Northwind Robotics, Inc. · synthetic books, no real financial data</span>
        </div>
      </footer>
    </div>
  );
}

/** A screen with nothing to show yet: say why, and what fills it. */
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="fig-frame rounded-[var(--radius-lg)] border border-line px-6 py-16 text-center">
      <Mark className="mx-auto h-5 w-5 text-faint" />
      <h2 className="headline mt-5 text-ink">{title}</h2>
      <div className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-muted">{children}</div>
    </div>
  );
}

export function EmptyRun() {
  return (
    <Empty title="No close run yet">
      <p>This screen renders a recorded run and nothing illustrative. Record one with</p>
      <pre className="mx-auto mt-4 w-fit rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-left font-mono text-[12px] text-ink-2">npm run simulate</pre>
      <p className="mt-3 text-[12px]">
        It needs a model credential: a card on the Vercel AI Gateway, or
        <code className="mx-1 font-mono">ANTHROPIC_API_KEY</code> in <code className="font-mono">.env.local</code>.
      </p>
    </Empty>
  );
}
