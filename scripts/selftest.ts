/**
 * Mechanism test - NOT a performance result.
 *
 * Substitutes a deterministic stand-in for the model so the whole loop can be
 * exercised with no credential: close run → gate → exception queue →
 * corrections → gradient step → evidence gate → backtest → rulebook → a cheaper
 * next close. It proves the machinery is wired, nothing about how good a real
 * model is at the task. `npm run simulate` is the measurement.
 */
import { MockLanguageModelV4 } from "ai/test";
import { generateAll } from "../src/lib/seed/generate";
import { VENDORS } from "../src/lib/seed/fixture";
import { setModelOverride } from "../src/lib/agent/provider";
import { assertMeasuredReport, simulate } from "../src/lib/agent/simulate";
import { splitKey } from "../src/lib/agent/close";
import { fmtUsd } from "../src/lib/agent/pricing";

const periods = generateAll();

// ── ground truth lookups the stand-in answers from ───────────────────────────
const codingTruth = new Map<string, { glCode: string; deptSplit: Record<string, number> }>();
const vendorOf = new Map<string, string>();
for (const p of periods) {
  for (const [num, t] of Object.entries(p.truth.coding)) codingTruth.set(num, t);
  for (const inv of p.apInvoices) vendorOf.set(inv.invoiceNumber, inv.vendorName);
}
const matchTruth = new Map<string, { bank: string[]; ledger: string[]; delta: string | null }>();
for (const p of periods) {
  for (const m of p.truth.matches) {
    for (const b of m.bankExternalIds) {
      matchTruth.set(b, { bank: m.bankExternalIds, ledger: m.ledgerExternalIds, delta: m.deltaReason });
    }
  }
}
/** The vendors whose settlement shape is genuinely awkward. */
const AWKWARD = new Set(VENDORS.filter((v) => v.quirk).map((v) => v.name));
const awkwardAlias = VENDORS.filter((v) => v.quirk).flatMap((v) => v.bankAliases.map((a) => a.slice(0, 12)));

const usage = {
  inputTokens: { total: 900, noCache: 900, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 260, text: 260, reasoning: 0 },
};
const reply = (obj: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(obj) }],
  finishReason: { unified: "stop" as const, raw: "stop" },
  usage,
  warnings: [],
});

const model = new MockLanguageModelV4({
  doGenerate: async (options) => {
    const text = JSON.stringify(options.prompt);

    // ── invoice coding ─────────────────────────────────────────────────────
    if (text.includes("uncoded_invoices")) {
      const decisions = [...codingTruth.keys()]
        .filter((num) => text.includes(num))
        .map((num) => {
          const t = codingTruth.get(num)!;
          // the stand-in is deliberately unsure on split-allocation vendors
          // until a rule exists, so the queue has real work in it
          const unsure = Object.keys(t.deptSplit).length > 1;
          return {
            invoiceNumber: num,
            glCode: t.glCode,
            deptSplit: Object.entries(t.deptSplit).map(([dept, weight]) => ({ dept, weight })),
            confidence: unsure ? 0.62 : 0.95,
            reasoning: unsure ? "multi-department allocation, no precedent" : "unambiguous vendor",
          };
        });
      return reply({ decisions });
    }

    // ── bank reconciliation ────────────────────────────────────────────────
    if (text.includes("bank_lines")) {
      const matches: unknown[] = [];
      const unmatchable: unknown[] = [];
      const usedLedger = new Set<string>();
      for (const [bankId, t] of matchTruth) {
        if (!text.includes(bankId)) continue;
        if (!t.bank.every((b) => text.includes(b))) continue;
        if (!t.ledger.every((l) => text.includes(l))) continue;
        if (t.ledger.some((l) => usedLedger.has(l))) continue;
        const awkward = awkwardAlias.some((a) => text.includes(a)) && t.delta !== null;
        t.ledger.forEach((l) => usedLedger.add(l));
        matches.push({
          bankExternalIds: t.bank,
          ledgerExternalIds: t.ledger,
          deltaReason: t.delta ?? "none",
          confidence: awkward ? 0.58 : 0.96,
          reasoning: awkward ? "residual present, cause not certain" : "clean tie-out",
        });
      }
      return reply({ matches, unmatchable });
    }

    // ── the gradient step ──────────────────────────────────────────────────
    if (text.includes("corrections")) {
      const rows: { id: string; vendor: string; agentSaid: string }[] =
        [...text.matchAll(/(COR-\d{4}-\d{2}-\d{3}),[^,]*,([^,]*),([^,]*),([^,]*),/g)]
          .map((m) => ({ id: m[1], vendor: m[3], agentSaid: m[4] }));

      // a correction about a match cannot evidence a coding rule
      const isMatching = (r: { agentSaid: string }) => /unmatched|residual|tie-out|timing/i.test(r.agentSaid);
      const codingBy = new Map<string, string[]>();
      const matchingBy = new Map<string, string[]>();
      for (const r of rows) {
        if (!r.vendor) continue;
        const bucket = isMatching(r) ? matchingBy : codingBy;
        (bucket.get(r.vendor) ?? bucket.set(r.vendor, []).get(r.vendor)!).push(r.id);
      }
      const byVendor = new Map([...codingBy.keys(), ...matchingBy.keys()].map((v) => [v, [] as string[]]));

      const rules: unknown[] = [];
      for (const [vendor] of byVendor) {
        const codingIds = codingBy.get(vendor) ?? [];
        const matchIds = matchingBy.get(vendor) ?? [];
        const sample = [...codingTruth.entries()].find(([num]) => vendorOf.get(num) === vendor);
        if (sample && codingIds.length >= 2) {              // the evidence gate, honoured
          const ids = codingIds;
          const t = sample[1];
          rules.push({
            kind: "coding", name: `${vendor} → ${t.glCode} (${splitKey(t.deptSplit)})`,
            predicate: [{ op: "vendor_is", value: vendor }],
            actionType: "code", glCode: t.glCode,
            deptSplit: Object.entries(t.deptSplit).map(([dept, weight]) => ({ dept, weight })),
            matchVendor: null, matchStrategy: null, deltaReason: null, tolerancePct: null,
            accrualBasis: null, reviewReason: null,
            rationale: `${ids.length} corrections agree on this coding`,
            fromCorrectionIds: ids.slice(0, 4),
          });
        }
        if (AWKWARD.has(vendor) && matchIds.length >= 2) {
          const ids = matchIds;
          const spec = VENDORS.find((v) => v.name === vendor)!;
          const strategy = spec.quirk === "net_settlement" ? "same_day_settlement"
            : spec.quirk === "installments" ? "installments" : "by_invoice";
          rules.push({
            kind: "matching", name: `${vendor} settles ${strategy.replace(/_/g, " ")}`,
            predicate: [{ op: "desc_contains", value: spec.bankAliases[0].slice(0, 12) }],
            actionType: "match", glCode: null, deptSplit: null,
            matchVendor: vendor, matchStrategy: strategy,
            deltaReason: spec.quirk === "fx" ? "fx" : spec.quirk === "net_settlement" ? "bank_fee" : "partial",
            tolerancePct: 0.03, accrualBasis: null, reviewReason: null,
            rationale: `${ids.length} corrections show the same settlement shape`,
            fromCorrectionIds: ids.slice(0, 4),
          });
        }
      }
      return reply({ rules });
    }

    return reply({});
  },
});

async function main() {
  setModelOverride(() => model);
  console.log("MECHANISM TEST — deterministic stand-in, not a real model.\n");

  const report = await simulate({ provenance: "mock", onProgress: (m) => console.log(m) });

  let mockRefused = false;
  try { assertMeasuredReport(report); } catch { mockRefused = true; }

  const degraded = structuredClone(report);
  degraded.provenance = "model";
  degraded.periods[0].stats.modelFailures = 1;
  let degradedRefused = false;
  try { assertMeasuredReport(degraded); } catch { degradedRefused = true; }

  const noCalls = structuredClone(report);
  noCalls.provenance = "model";
  noCalls.totals.llmCalls = 0;
  let noCallsRefused = false;
  try { assertMeasuredReport(noCalls); } catch { noCallsRefused = true; }

  console.log("\nperiod   cleared  exc  rules  llm  cost");
  for (const p of report.periods) {
    console.log([
      p.period.padEnd(8),
      `${(p.stats.autoClearRate * 100).toFixed(0)}%`.padStart(7),
      String(p.stats.exceptionsOpened).padStart(4),
      String(p.activeRules).padStart(6),
      String(p.stats.llmCalls).padStart(4),
      fmtUsd(p.stats.costMicros).padStart(9),
    ].join(" "));
  }

  const first = report.periods[0], last = report.periods[report.periods.length - 1];
  const checks: [string, boolean, string][] = [
    ["mock report cannot pass measured gate", mockRefused, report.provenance],
    ["degraded run cannot pass measured gate", degradedRefused, `${degraded.periods[0].stats.modelFailures} failed batch`],
    ["zero-call run cannot pass measured gate", noCallsRefused, `${noCalls.totals.llmCalls} successful calls`],
    ["close run produces decisions", first.stats.llmCalls > 0, `${first.stats.llmCalls} calls in ${first.period}`],
    ["exceptions reach the queue", first.stats.exceptionsOpened > 0, `${first.stats.exceptionsOpened} opened`],
    ["gradient step proposes rules", report.periods.some((p) => p.proposals.length > 0), `${report.periods.reduce((n, p) => n + p.proposals.length, 0)} proposals`],
    ["evidence gate holds (>=2 each)", report.rulebook.every((r) => r.evidence.length >= 2), `min ${Math.min(...report.rulebook.map((r) => r.evidence.length), 99)}`],
    ["no rule active without a backtest", report.rulebook.every((r) => r.backtest !== null), `${report.rulebook.length} rules`],
    ["rulebook grows", last.rulebookVersionOut > 0, `v${last.rulebookVersionOut}`],
    ["rules take over work", last.stats.ruleHits > first.stats.ruleHits, `${first.stats.ruleHits} → ${last.stats.ruleHits} rule hits`],
    ["exceptions fall", last.stats.exceptionsOpened < first.stats.exceptionsOpened, `${first.stats.exceptionsOpened} → ${last.stats.exceptionsOpened}`],
    ["auto-clear precision holds", last.stats.autoClearPrecision >= 0.99, `${(last.stats.autoClearPrecision * 100).toFixed(1)}%`],
  ];

  console.log("");
  let failed = 0;
  for (const [name, ok, detail] of checks) {
    if (!ok) failed++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(34)} ${detail}`);
  }
  if (process.argv.includes("--write")) {
    const { getStore } = await import("../src/lib/store");
    await (await getStore()).saveReport(report);
    console.log("\nwrote a MOCK-provenance report; the UI will label it as such.");
  }
  console.log(failed === 0 ? "\nloop wired end to end." : `\n${failed} check(s) failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("selftest crashed:", e?.message ?? e); process.exit(1); });
