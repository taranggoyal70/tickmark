"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { importPeriodAction, type ImportOutcome } from "./actions";

const FILES = [
  { name: "bank", label: "Bank statement", hint: "external_id, posted_date, description, amount", required: true },
  { name: "invoices", label: "AP invoices", hint: "vendor, invoice_number, invoice_date, amount", required: true },
  { name: "ledger", label: "General ledger", hint: "external_id, entry_date, gl_code, amount, memo", required: false },
  { name: "chart", label: "Chart of accounts", hint: "code, name, type — a standard one is used if omitted", required: false },
  { name: "vendors", label: "Vendor list", hint: "name, bank_aliases separated by |", required: false },
];

export function ImportForm() {
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [pending, start] = useTransition();

  const submit = (form: FormData) => start(async () => setOutcome(await importPeriodAction(form)));

  return (
    <form action={submit} className="space-y-5">
      <div className="panel p-5">
        <h2 className="card-title mb-4 text-ink">Your company</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="eyebrow mb-1.5 block">Entity name</span>
            <input name="entity" required placeholder="Acme, Inc." defaultValue=""
              className="focus-ring w-full rounded-[var(--radius-md)] border border-hairline bg-surface-2 px-3 py-2 text-[14px] text-ink placeholder:text-ink-tertiary" />
          </label>
          <label className="block">
            <span className="eyebrow mb-1.5 block">Period</span>
            <input name="period" required placeholder="2026-05" pattern="\d{4}-\d{2}"
              className="focus-ring nums w-full rounded-[var(--radius-md)] border border-hairline bg-surface-2 px-3 py-2 text-[14px] text-ink placeholder:text-ink-tertiary" />
          </label>
          <label className="block">
            <span className="eyebrow mb-1.5 block">Materiality (USD)</span>
            <input name="materiality" type="number" min="0" step="500" defaultValue={25000}
              className="focus-ring nums w-full rounded-[var(--radius-md)] border border-hairline bg-surface-2 px-3 py-2 text-[14px] text-ink" />
            <span className="mt-1.5 block text-[12px] leading-snug text-ink-tertiary">
              Above this, a person reviews it whatever the agent thinks.
            </span>
          </label>
        </div>
      </div>

      <div className="panel p-5">
        <h2 className="card-title mb-1 text-ink">Your books</h2>
        <p className="mb-4 text-[13px] text-ink-subtle">
          CSV exports, as they come out of your bank and your bookkeeping system. Headers are matched
          loosely — <span className="nums">Posted Date</span>, <span className="nums">posted_date</span> and{" "}
          <span className="nums">POSTED-DATE</span> all work, and{" "}
          <span className="nums">$1,234.56</span>, <span className="nums">(1,234.56)</span> and{" "}
          <span className="nums">-1234.56</span> all mean the same thing.
        </p>
        <div className="space-y-3">
          {FILES.map((f) => (
            <label key={f.name} className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-hairline bg-surface-1 px-3 py-2.5">
              <span className="min-w-[9.5rem] text-[13px] font-medium text-ink">
                {f.label}
                {f.required ? <span className="text-[var(--danger)]"> *</span> : <span className="text-ink-tertiary"> — optional</span>}
              </span>
              <input type="file" name={f.name} accept=".csv,text/csv" required={f.required}
                className="text-[12px] text-ink-subtle file:mr-3 file:rounded-[var(--radius-sm)] file:border file:border-hairline file:bg-surface-2 file:px-2.5 file:py-1 file:text-[12px] file:text-ink" />
              <span className="nums ml-auto text-[11px] text-ink-tertiary">{f.hint}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending}
          className="focus-ring rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2.5 text-[14px] font-medium text-[var(--on-primary)] transition-colors hover:bg-[var(--primary-hover)] disabled:opacity-50">
          {pending ? "Importing…" : "Import this period"}
        </button>
        <span className="text-[12px] text-ink-tertiary">Nothing is posted. Import only loads the books.</span>
      </div>

      {outcome ? (
        <div className={`panel p-5 ${outcome.ok ? "" : "border-[var(--danger)]/40"}`}>
          <p className={`text-[14px] font-medium ${outcome.ok ? "text-ink" : "text-[var(--danger)]"}`}>{outcome.message}</p>

          {outcome.counts ? (
            <div className="nums mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-muted">
              <span>{outcome.counts.bankLines} bank lines</span>
              <span>{outcome.counts.ledgerEntries} ledger entries</span>
              <span>{outcome.counts.apInvoices} invoices</span>
              <span>{outcome.counts.vendors} vendors</span>
              <span>{outcome.counts.accounts} accounts</span>
            </div>
          ) : null}

          {outcome.warnings?.length ? (
            <ul className="mt-3 space-y-1">
              {outcome.warnings.map((w, i) => (
                <li key={i} className="text-[12px] leading-snug text-[#8a5a00]">{w}</li>
              ))}
            </ul>
          ) : null}

          {outcome.rejected?.length ? (
            <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--danger)]/25 bg-[var(--danger)]/6 p-3">
              <p className="text-[12px] font-medium text-[var(--danger)]">
                {outcome.rejected.length} rows could not be read and were not imported
              </p>
              <ul className="nums mt-1.5 space-y-0.5">
                {outcome.rejected.map((r, i) => (
                  <li key={i} className="text-[12px] text-ink-muted">{r.table} row {r.row} — {r.reason}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {outcome.ok ? (
            <Link href="/close"
              className="focus-ring mt-4 inline-flex rounded-[var(--radius-md)] bg-[var(--primary)] px-3.5 py-2 text-[13px] font-medium text-[var(--on-primary)] hover:bg-[var(--primary-hover)]">
              Close {outcome.period} →
            </Link>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
