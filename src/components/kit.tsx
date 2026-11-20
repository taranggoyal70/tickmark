import type { ReactNode } from "react";

export function Panel({ children, className = "", ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`panel ${className}`} {...rest}>{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="eyebrow">{children}</div>;
}

/**
 * A single headline number under a rule of ink, label in the margin style.
 * Per the form heuristic, one number with no comparison is a stat tile, not a
 * chart.
 */
export function Stat({
  label, value, sub, tone = "neutral",
}: { label: string; value: ReactNode; sub?: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }) {
  // The number stays in ink. State is carried by a dot plus words in the
  // caption, never by colour alone.
  const dot =
    tone === "good" ? "bg-[var(--ok)]" :
    tone === "warn" || tone === "bad" ? "bg-[var(--signal)]" : "bg-[var(--faint)]";
  return (
    <div className="ink-rule pt-4 pr-4">
      <div className="label mb-3">{label}</div>
      <div className="nums text-[clamp(34px,3.6vw,48px)] font-medium leading-[0.95] tracking-[-0.05em] text-ink">{value}</div>
      {sub ? (
        <div className="mt-3 flex items-start gap-2 text-[13px] leading-snug text-muted">
          <span className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
          <span>{sub}</span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Small mono tags. Ink for what a rule decided, signal for what needs a person,
 * green only for a state that is settled and good.
 */
const BADGE: Record<string, string> = {
  rule:    "bg-[var(--ink)] text-[var(--on-ink)]",
  agent:   "bg-transparent text-ink-2 shadow-[inset_0_0_0_1px_var(--line-2)]",
  human:   "bg-[var(--signal-bg)] text-signal-ink",
  neutral: "bg-bg-2 text-ink-2",
  good:    "bg-[var(--ok-bg)] text-[var(--ok)]",
  warn:    "bg-[var(--signal-bg)] text-signal-ink",
  bad:     "bg-[var(--signal-bg)] text-signal-ink",
};

export function Badge({ kind = "neutral", children }: { kind?: keyof typeof BADGE | string; children: ReactNode }) {
  return <span className={`tag ${BADGE[kind] ?? BADGE.neutral}`}>{children}</span>;
}

export function Money({ cents, className = "" }: { cents: number; className?: string }) {
  const neg = cents < 0;
  return (
    <span className={`nums ${neg ? "text-ink-2" : "text-ink"} ${className}`}>
      {neg ? "-" : ""}${Math.abs(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

export function Divider() {
  return <div className="h-px bg-[var(--line)]" />;
}

export function Button({
  children, variant = "primary", ...rest
}: { children: ReactNode; variant?: "primary" | "secondary" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`btn btn-sm ${variant === "primary" ? "btn-primary" : ""}`} {...rest}>{children}</button>;
}
