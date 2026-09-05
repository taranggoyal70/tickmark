import type { ReactNode } from "react";

export function Panel({ children, className = "", ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`panel ${className}`} {...rest}>{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="eyebrow">{children}</div>;
}

/**
 * A single headline number. Per the form heuristic, one number with no
 * comparison is a stat tile, not a chart.
 */
export function Stat({
  label, value, sub, tone = "neutral",
}: { label: string; value: ReactNode; sub?: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const toneClass =
    tone === "good" ? "text-[var(--success)]" :
    tone === "warn" ? "text-[var(--warning)]" :
    tone === "bad"  ? "text-[var(--danger)]"  : "text-ink";
  return (
    <div className="panel p-5">
      <div className="eyebrow mb-2">{label}</div>
      <div className={`nums text-[32px] font-semibold leading-none tracking-[-0.02em] ${toneClass}`}>{value}</div>
      {sub ? <div className="mt-2 text-[13px] text-ink-subtle leading-snug">{sub}</div> : null}
    </div>
  );
}

const BADGE: Record<string, string> = {
  rule:    "bg-[#3987e5]/12 text-[#7fb4f0] border-[#3987e5]/30",
  agent:   "bg-[#199e70]/12 text-[#5cc79b] border-[#199e70]/30",
  human:   "bg-[#d95926]/12 text-[#f0916a] border-[#d95926]/30",
  neutral: "bg-surface-3 text-ink-subtle border-hairline",
  good:    "bg-[#0ca30c]/12 text-[#5fd05f] border-[#0ca30c]/30",
  warn:    "bg-[#fab219]/12 text-[#f5cc6b] border-[#fab219]/30",
  bad:     "bg-[#d03b3b]/12 text-[#ef8686] border-[#d03b3b]/30",
};

export function Badge({ kind = "neutral", children }: { kind?: keyof typeof BADGE | string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-2 py-0.5 text-[11px] font-medium ${BADGE[kind] ?? BADGE.neutral}`}>
      {children}
    </span>
  );
}

export function Money({ cents, className = "" }: { cents: number; className?: string }) {
  const neg = cents < 0;
  return (
    <span className={`nums ${neg ? "text-ink-muted" : "text-ink"} ${className}`}>
      {neg ? "-" : ""}${Math.abs(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

export function Divider() {
  return <div className="h-px bg-[var(--hairline)]" />;
}

export function Button({
  children, variant = "primary", ...rest
}: { children: ReactNode; variant?: "primary" | "secondary" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = "focus-ring inline-flex items-center gap-2 rounded-[var(--radius-md)] px-3.5 py-2 text-[13px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const v = variant === "primary"
    ? "bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--primary-hover)]"
    : "bg-surface-1 text-ink border border-hairline hover:bg-surface-3";
  return <button className={`${base} ${v}`} {...rest}>{children}</button>;
}
