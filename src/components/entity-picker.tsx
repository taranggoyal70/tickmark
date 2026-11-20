import Link from "next/link";
import type { Books } from "@/lib/access";

/** A filter chip: ink when chosen, paper otherwise. Shared by the company and period pickers. */
export const chip = (active: boolean) =>
  `focus-ring nums inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 py-1 text-[12.5px] transition-colors ${
    active
      ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--on-ink)]"
      : "border-line bg-[var(--surface)] text-ink-2 hover:border-[var(--line-3)] hover:text-ink"}`;

/**
 * Which company a book view is showing. Only drawn when the viewer can read
 * more than one: their own books and the public demo, say.
 */
export function EntityPicker({ books, current, href }: {
  books: Books[]; current: Books; href: (b: Books) => string;
}) {
  if (books.length < 2) return null;
  return (
    <nav aria-label="Company" className="mb-8 flex flex-wrap items-center gap-1.5">
      <span className="label mr-2">Company</span>
      {books.map((b) => (
        <Link key={b.id} href={href(b)} aria-current={b.id === current.id ? "page" : undefined} className={chip(b.id === current.id)}>
          {b.name}
          {b.demo ? <span className="font-mono text-[10px] uppercase tracking-[0.08em] opacity-70">demo</span> : null}
        </Link>
      ))}
    </nav>
  );
}

/** The period chips for one company's book view. */
export function PeriodPicker({ periods, current, href }: {
  periods: string[]; current: string; href: (period: string) => string;
}) {
  return (
    <nav aria-label="Period" className="flex flex-wrap gap-1.5">
      {periods.map((p) => (
        <Link key={p} href={href(p)} aria-current={p === current ? "page" : undefined} className={chip(p === current)}>
          {p}
        </Link>
      ))}
    </nav>
  );
}
