"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { ensureChart, ensureEntity, ensureVendors, ingestPeriod } from "@/lib/ingest/ingest";
import { parseCsv } from "@/lib/ingest/schema";
import { ACCRUED_LIABILITIES, STARTER_CHART, STARTER_DEPARTMENTS } from "@/lib/ingest/starter-chart";

export interface ImportOutcome {
  ok: boolean;
  message: string;
  entity?: string;
  period?: string;
  counts?: { bankLines: number; ledgerEntries: number; apInvoices: number; vendors: number; accounts: number };
  rejected?: { table: string; row: number; reason: string }[];
  warnings?: string[];
}

type Account = { code: string; name: string; type: string; normal: string };

const text = async (f: FormDataEntryValue | null) =>
  f instanceof File && f.size > 0 ? await f.text() : undefined;

/**
 * Import a period from the browser.
 *
 * Deliberately tolerant of what a finance team actually has to hand: a chart of
 * accounts is used if supplied and a conventional one assumed if not, and
 * vendors are created from the invoices themselves rather than demanded up
 * front. What it will not do is guess at an amount or a date it cannot read.
 */
export async function importPeriodAction(form: FormData): Promise<ImportOutcome> {
  const { userId } = await auth();
  if (!userId) return { ok: false, message: "Sign in to import books." };

  const entityName = String(form.get("entity") ?? "").trim();
  const period = String(form.get("period") ?? "").trim();
  if (!entityName) return { ok: false, message: "Give the entity a name." };
  if (!/^\d{4}-\d{2}$/.test(period)) return { ok: false, message: "Period must look like 2026-05." };

  const materiality = Math.round(Number(form.get("materiality") ?? 25000) * 100);
  const warnings: string[] = [];

  try {
    const entityId = await ensureEntity(entityName, { materialityCents: materiality || 2_500_000 });

    // ── chart of accounts ────────────────────────────────────────────────────
    const chartCsv = await text(form.get("chart"));
    let accounts: Account[] = STARTER_CHART.map((a) => ({ ...a }));
    if (chartCsv) {
      const parsed: Account[] = parseCsv(chartCsv).flatMap((r) => {
        const code = String(r.code ?? r.account ?? r.gl_code ?? "").trim();
        const name = String(r.name ?? r.account_name ?? "").trim();
        if (!code || !name) return [];
        const type = String(r.type ?? "expense").toLowerCase();
        const safeType = ["asset", "liability", "equity", "revenue", "expense"].includes(type) ? type : "expense";
        return [{
          code, name, type: safeType,
          normal: String(r.normal ?? r.normal_balance ?? (["liability", "equity", "revenue"].includes(safeType) ? "credit" : "debit")),
        }];
      });
      if (parsed.length) accounts = parsed;
      else warnings.push("The chart file had no readable rows, so a standard chart was used instead.");
    } else {
      warnings.push("No chart of accounts supplied, so a standard one was used. Upload yours to code to your own accounts.");
    }
    if (!accounts.some((a) => a.code === ACCRUED_LIABILITIES)) {
      accounts.push({ code: ACCRUED_LIABILITIES, name: "Accrued Liabilities", type: "liability", normal: "credit" });
      warnings.push(`Added account ${ACCRUED_LIABILITIES} (Accrued Liabilities) — an accrual cannot balance without it.`);
    }
    await ensureChart(entityId, accounts, STARTER_DEPARTMENTS.map((d) => ({ ...d })));

    // ── vendors: from a file if given, otherwise from the invoices ──────────
    const invoicesCsv = await text(form.get("invoices"));
    const vendorsCsv = await text(form.get("vendors"));
    const vendorMap = new Map<string, { name: string; bankAliases: string[] }>();
    if (vendorsCsv) {
      for (const r of parseCsv(vendorsCsv)) {
        const name = String(r.name ?? r.vendor ?? "").trim();
        if (!name) continue;
        const aliases = String(r.bank_aliases ?? r.aliases ?? "").split("|").map((x) => x.trim()).filter(Boolean);
        vendorMap.set(name, { name, bankAliases: aliases.length ? aliases : [name] });
      }
    }
    if (invoicesCsv) {
      for (const r of parseCsv(invoicesCsv)) {
        const name = String(r.vendor ?? "").trim();
        if (name && !vendorMap.has(name)) vendorMap.set(name, { name, bankAliases: [name] });
      }
    }
    if (vendorMap.size) await ensureVendors(entityId, [...vendorMap.values()]);
    if (!vendorsCsv && vendorMap.size) {
      warnings.push("Vendors were created from your invoices. Upload a vendor list with bank aliases to match statement wording better.");
    }

    // ── the books ───────────────────────────────────────────────────────────
    const report = await ingestPeriod(entityId, period, {
      bank: await text(form.get("bank")),
      ledger: await text(form.get("ledger")),
      invoices: invoicesCsv,
    });

    revalidatePath("/close");
    revalidatePath("/setup");

    const nothing = report.bankLines + report.ledgerEntries + report.apInvoices === 0;
    return {
      ok: !nothing,
      message: nothing
        ? "Nothing was imported — check the files have headers and at least one row."
        : `Imported ${period} for ${entityName}.`,
      entity: entityName,
      period,
      counts: {
        bankLines: report.bankLines, ledgerEntries: report.ledgerEntries, apInvoices: report.apInvoices,
        vendors: vendorMap.size, accounts: accounts.length,
      },
      rejected: report.rejected.slice(0, 12),
      warnings,
    };
  } catch (e) {
    return { ok: false, message: (e as Error).message, warnings };
  }
}
