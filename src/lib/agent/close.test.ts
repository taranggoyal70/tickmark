import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { MockLanguageModelV4 } from "ai/test";
import { auditDraw, runClose, type CloseInput } from "./close";
import { setModelOverride } from "./provider";
import type { ChartContext } from "./llm";
import type { ClosePeriodData, Rule } from "./types";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};
const replying = (answer: (prompt: string) => unknown) => new MockLanguageModelV4({
  doGenerate: async (options) => ({
    content: [{ type: "text" as const, text: JSON.stringify(answer(JSON.stringify(options.prompt))) }],
    finishReason: { unified: "stop" as const, raw: "stop" }, usage, warnings: [],
  }),
});
/** A model that is certain, and right, about everything it is asked. */
const confident = replying((p) => (p.includes("uncoded_invoices")
  ? { decisions: [{ invoiceNumber: "INV-2", glCode: "6830", deptSplit: [{ dept: "ENG", weight: 1 }], confidence: 0.99, reasoning: "sure" }] }
  : { matches: [], unmatchable: [] }));
const down = new MockLanguageModelV4({ doGenerate: async () => { throw new Error("provider is down"); } });

after(() => setModelOverride(null));

const chart: ChartContext = {
  accounts: [{ code: "6820", name: "Cloud", type: "expense" }, { code: "6830", name: "Software", type: "expense" }],
  departments: [{ code: "ENG", name: "Engineering" }],
  materialityCents: 2_500_000, ruleCeilingCents: 25_000_000,
};
const period: ClosePeriodData = {
  code: "2026-03",
  bankLines: [],
  ledgerEntries: [],
  apInvoices: [
    { vendorName: "Amazon Web Services", invoiceNumber: "INV-1", invoiceDate: "2026-03-02", dueDate: "2026-04-01", amountCents: 4_820_000, currency: "USD", description: "usage", lineItems: [] },
    { vendorName: "Linear", invoiceNumber: "INV-2", invoiceDate: "2026-03-03", dueDate: "2026-04-02", amountCents: 96_000, currency: "USD", description: "seats", lineItems: [] },
    { vendorName: "Amazon Web Services", invoiceNumber: "INV-3", invoiceDate: "2026-03-20", dueDate: "2026-04-19", amountCents: 30_000_000, currency: "USD", description: "reserved", lineItems: [] },
  ],
};
const awsRule: Rule = {
  id: "R-AWS", kind: "coding", name: "AWS", status: "active", version: 1, evidence: [], backtest: null,
  hitCount: 0, createdAt: "2026-02-28T00:00:00.000Z",
  predicate: [{ op: "vendor_is", value: "Amazon Web Services" }],
  action: { type: "code", glCode: "6820", deptSplit: { ENG: 1 } },
};
const input = (over: Partial<CloseInput> = {}): CloseInput => ({
  period, rulebook: { version: 1, rules: [awsRule] }, chart, history: [], recurringHistory: {},
  autoThreshold: 0.9, ...over,
});
const causeOf = (run: Awaited<ReturnType<typeof runClose>>, ref: string) => run.exceptions.find((e) => e.subjectRef === ref)?.cause;

describe("the close gate", () => {
  test("a rule clears within its ceiling; a confident model suggestion never does", async () => {
    setModelOverride(() => confident);
    const run = await runClose(input());

    assert.deepEqual(run.tickmarks.map((t) => t.subjectRef), ["INV-1"]);
    assert.equal(run.tickmarks[0].assertedBy, "rule");
    assert.equal(causeOf(run, "INV-2"), "unverified_model_judgment");
    assert.equal(run.stats.ruleHits, 2);
    assert.equal(run.stats.llmCalls, 1);
  });

  test("above the rule ceiling, even a rule hands the line to a person", async () => {
    setModelOverride(() => confident);
    const run = await runClose(input());
    assert.equal(causeOf(run, "INV-3"), "over_materiality");
  });

  test("with every line settled by rules, the model is not called at all", async () => {
    setModelOverride(() => down);
    const run = await runClose(input({ period: { ...period, apInvoices: [period.apInvoices[0]] } }));
    assert.equal(run.stats.llmCalls, 0);
    assert.equal(run.stats.modelFailures, 0);
    assert.equal(run.tickmarked, 1);
  });

  test("a provider outage does not stop the close; the rest is labelled model_unavailable", async () => {
    setModelOverride(() => down);
    const run = await runClose(input());
    assert.equal(run.stats.modelFailures, 1);
    assert.equal(causeOf(run, "INV-2"), "model_unavailable");
    assert.deepEqual(run.tickmarks.map((t) => t.subjectRef), ["INV-1"]);
  });

  test("an invoice the model silently drops still reaches the queue", async () => {
    setModelOverride(() => replying(() => ({ decisions: [] })));
    const run = await runClose(input());
    assert.equal(causeOf(run, "INV-2"), "no_candidate");
  });
});

describe("audit sampling", () => {
  test("the draw is deterministic and spread over [0, 1)", () => {
    assert.equal(auditDraw("2026-03", "INV-1"), auditDraw("2026-03", "INV-1"));
    assert.notEqual(auditDraw("2026-03", "INV-1"), auditDraw("2026-04", "INV-1"));
    const draws = Array.from({ length: 2000 }, (_, i) => auditDraw("2026-03", `INV-${i}`));
    const share = draws.filter((d) => d < 0.25).length / draws.length;
    assert.ok(share > 0.23 && share < 0.27, `share ${share}`);
  });

  test("at rate 1 every rule decision is checked; at 0 none is", async () => {
    setModelOverride(() => confident);
    assert.equal(causeOf(await runClose(input({ auditRate: 1 })), "INV-1"), "audit_sample");
    assert.equal(causeOf(await runClose(input({ auditRate: 0 })), "INV-1"), undefined);
  });

  test("a rate outside [0, 1] is refused", async () => {
    await assert.rejects(runClose(input({ auditRate: 1.5 })), /auditRate/);
    await assert.rejects(runClose(input({ auditRate: Number.NaN })), /auditRate/);
  });
});
