import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  applyAccrualRules, applyCodingRules, applyMatchingRule, backtestRule, describeAction, evaluate,
  forcesReview, pickUnambiguous, type MatchWorkspace,
} from "./rules";
import type { ApInvoice, BankLine, LedgerEntry, Rule, Rulebook } from "./types";

const rule = (r: Partial<Rule> & Pick<Rule, "kind" | "predicate" | "action">): Rule => ({
  id: "R1", name: "test rule", status: "active", version: 1, evidence: [], backtest: null,
  hitCount: 0, createdAt: "2026-01-01T00:00:00.000Z", ...r,
});
const book = (...rules: Rule[]): Rulebook => ({ version: 1, rules });
const inv = (vendorName: string, amountCents: number, invoiceNumber = "INV-1"): ApInvoice => ({
  vendorName, invoiceNumber, invoiceDate: "2026-03-02", dueDate: "2026-04-01", amountCents,
  currency: "USD", description: "monthly usage", lineItems: [],
});
const bank = (externalId: string, description: string, amountCents: number, postedDate = "2026-03-15"): BankLine =>
  ({ externalId, postedDate, description, amountCents, currency: "USD" });
const led = (externalId: string, vendorName: string | null, amountCents: number, memo: string, entryDate = "2026-03-10", source = "ap"): LedgerEntry =>
  ({ externalId, entryDate, glCode: "6820", deptCode: null, vendorName, amountCents, memo, source });
const ws = (bankLines: BankLine[], ledger: LedgerEntry[]): MatchWorkspace =>
  ({ bankLines, ledger, consumedBank: new Set(), consumedLedger: new Set() });

describe("predicates", () => {
  test("vendor and narrative comparisons ignore case and punctuation", () => {
    assert.equal(evaluate([{ op: "vendor_is", value: "amazon web services" }], { vendorName: "Amazon Web Services" }), true);
    assert.equal(evaluate([{ op: "desc_contains", value: "digi key" }], { description: "DIGI-KEY CORP THIEF RIVER" }), true);
  });

  test("every clause must hold", () => {
    const p = [{ op: "vendor_is" as const, value: "Flexport" }, { op: "amount_lte" as const, value: 5_000_000 }];
    assert.equal(evaluate(p, { vendorName: "Flexport", amountCents: 4_000_000 }), true);
    assert.equal(evaluate(p, { vendorName: "Flexport", amountCents: 6_000_000 }), false);
  });

  test("an invalid regular expression fails closed", () => {
    assert.equal(evaluate([{ op: "desc_matches", value: "(" }], { description: "anything" }), false);
  });
});

describe("coding rules", () => {
  const aws = rule({
    kind: "coding", predicate: [{ op: "vendor_is", value: "Amazon Web Services" }],
    action: { type: "code", glCode: "6820", deptSplit: { ENG: 0.6, DATA: 0.25, PROD: 0.15 } },
  });

  test("a matching rule codes the invoice for zero model calls and names itself", () => {
    const d = applyCodingRules(book(aws), inv("Amazon Web Services", 4_820_000));
    assert.equal(d?.glCode, "6820");
    assert.equal(d?.decidedBy, "rule");
    assert.equal(d?.ruleId, "R1");
  });

  test("proposed, disabled and other-vendor rules never decide", () => {
    assert.equal(applyCodingRules(book({ ...aws, status: "proposed" }), inv("Amazon Web Services", 1)), null);
    assert.equal(applyCodingRules(book({ ...aws, status: "disabled" }), inv("Amazon Web Services", 1)), null);
    assert.equal(applyCodingRules(book(aws), inv("Datadog", 1)), null);
  });

  test("a materiality rule forces review whatever a coding rule says", () => {
    const big = rule({ id: "R2", kind: "materiality", predicate: [{ op: "amount_gte", value: 10_000_000 }], action: { type: "always_review", reason: "large" } });
    assert.equal(forcesReview(book(aws, big), { amountCents: 12_000_000 }), "large");
    assert.equal(forcesReview(book(aws, big), { amountCents: 100 }), null);
  });

  test("describeAction is independent of department order", () => {
    const a = describeAction(aws);
    const b = describeAction({ ...aws, action: { type: "code", glCode: "6820", deptSplit: { PROD: 0.15, ENG: 0.6, DATA: 0.25 } } });
    assert.equal(a, b);
    assert.equal(a, "6820|DATA:25/ENG:60/PROD:15");
  });
});

describe("matching rules", () => {
  const mouser = rule({
    kind: "matching", predicate: [{ op: "desc_contains", value: "MOUSER" }],
    action: { type: "match", vendorName: "Mouser Electronics", strategy: "by_invoice", deltaReason: null, tolerancePct: 0.02 },
  });

  test("by_invoice ties a payment to the vendor's invoice group", () => {
    const b = bank("B1", "MOUSER ELECTRONI", -1_590_951);
    const d = applyMatchingRule(mouser, b, ws([b], [led("L1", "Mouser Electronics", 1_590_951, "Mouser MOU-1")]));
    assert.deepEqual(d?.ledgerExternalIds, ["L1"]);
    assert.equal(d?.amountDeltaCents, 0);
    assert.equal(d?.cardinality, "1:1");
  });

  test("two invoices within tolerance of each other: the exact one wins", () => {
    const b = bank("B1", "MOUSER ELECTRONI", -1_583_852);
    const ledger = [led("L1", "Mouser Electronics", 1_590_951, "Mouser MOU-1"), led("L2", "Mouser Electronics", 1_583_852, "Mouser MOU-2")];
    assert.deepEqual(applyMatchingRule(mouser, b, ws([b], ledger))?.ledgerExternalIds, ["L2"]);
  });

  test("two candidates and no exact tie-out: the rule refuses rather than guess", () => {
    const b = bank("B1", "MOUSER ELECTRONI", -1_587_000);
    const ledger = [led("L1", "Mouser Electronics", 1_590_951, "Mouser MOU-1"), led("L2", "Mouser Electronics", 1_583_852, "Mouser MOU-2")];
    assert.equal(applyMatchingRule(mouser, b, ws([b], ledger)), null);
  });

  test("outside tolerance and outside the date window, nothing fires", () => {
    const b = bank("B1", "MOUSER ELECTRONI", -1_000_000);
    assert.equal(applyMatchingRule(mouser, b, ws([b], [led("L1", "Mouser Electronics", 1_500_000, "m")])), null);
    const late = bank("B2", "MOUSER ELECTRONI", -1_500_000, "2026-06-30");
    assert.equal(applyMatchingRule(mouser, late, ws([late], [led("L1", "Mouser Electronics", 1_500_000, "m")])), null);
  });

  test("installments pair the right tranches when two shipments overlap", () => {
    const flexport = rule({
      kind: "matching", predicate: [{ op: "desc_contains", value: "FLEXPORT" }],
      action: { type: "match", vendorName: "Flexport", strategy: "installments", deltaReason: "partial", tolerancePct: 0.02 },
    });
    const lines = [
      bank("B1", "FLEXPORT INC TRANCHE 1/2", -3_000_000, "2026-03-10"),
      bank("B2", "FLEXPORT INC TRANCHE 1/2", -4_200_000, "2026-03-11"),
      bank("B3", "FLEXPORT INC TRANCHE 2/2", -2_000_000, "2026-03-16"),
      bank("B4", "FLEXPORT INC TRANCHE 2/2", -2_800_000, "2026-03-17"),
    ];
    const ledger = [led("L1", "Flexport", 5_000_000, "Flexport A"), led("L2", "Flexport", 7_000_000, "Flexport B")];
    const d = applyMatchingRule(flexport, lines[0], ws(lines, ledger));
    assert.deepEqual(d?.bankExternalIds, ["B1", "B3"]);
    assert.deepEqual(d?.ledgerExternalIds, ["L1"]);
    assert.equal(d?.cardinality, "many:1");
  });

  test("same-day settlement takes the vendor's lines, not an unrelated fee that day", () => {
    const gusto = rule({
      kind: "matching", predicate: [{ op: "desc_contains", value: "GUSTO" }],
      action: { type: "match", vendorName: "Gusto", strategy: "same_day_settlement", deltaReason: null, tolerancePct: 0.02 },
    });
    const b = bank("B1", "GUSTO TAX COLLECTION", -21_146_541, "2026-06-15");
    const ledger = [
      led("L1", "Gusto", 17_340_164, "Semi-monthly payroll run", "2026-06-15", "payroll"),
      led("L2", "Gusto", 3_806_377, "Employer taxes & benefits", "2026-06-15", "payroll"),
      led("L3", null, 5_505, "WIRE TRANSFER FEE INTL", "2026-06-15", "bank_fee"),
    ];
    const d = applyMatchingRule(gusto, b, ws([b], ledger));
    assert.deepEqual(d?.ledgerExternalIds, ["L1", "L2"]);
    assert.equal(d?.amountDeltaCents, 0);
  });

  test("same-day settlement adds the vendorless revenue of a processor payout", () => {
    const stripe = rule({
      kind: "matching", predicate: [{ op: "desc_contains", value: "STRIPE" }],
      action: { type: "match", vendorName: "Stripe", strategy: "same_day_settlement", deltaReason: "bank_fee", tolerancePct: 0.02 },
    });
    const b = bank("B1", "STRIPE PAYOUT 8812", 9_126_570, "2026-03-07");
    const ledger = [
      led("L1", null, -9_398_030, "Product revenue - card settlements", "2026-03-07", "ar"),
      led("L2", "Stripe", 271_460, "Stripe processing fees", "2026-03-07", "bank_fee"),
    ];
    assert.deepEqual(applyMatchingRule(stripe, b, ws([b], ledger))?.ledgerExternalIds, ["L2", "L1"]);
  });

  test("pickUnambiguous", () => {
    const d = (delta: number) => ({ bankExternalIds: ["B"], ledgerExternalIds: [String(delta)], cardinality: "1:1" as const, amountDeltaCents: delta, deltaReason: null, confidence: 1, decidedBy: "rule" as const });
    assert.equal(pickUnambiguous([]), null);
    assert.equal(pickUnambiguous([d(5)])?.amountDeltaCents, 5);
    assert.equal(pickUnambiguous([d(5), d(0)])?.amountDeltaCents, 0);
    assert.equal(pickUnambiguous([d(5), d(7)]), null);
    assert.equal(pickUnambiguous([d(0), d(0)]), null);
  });
});

describe("accrual rules", () => {
  const datadog = rule({
    kind: "accrual", predicate: [{ op: "vendor_is", value: "Datadog" }],
    action: { type: "accrue", glCode: "6820", basis: "trailing_avg_3" },
  });

  test("a silent recurring vendor is accrued at its trailing average, in whole cents", () => {
    const a = applyAccrualRules(book(datadog), "Datadog", [100, 200, 301, 400], false);
    assert.equal(a?.amountCents, 300);
    assert.equal(a?.glCode, "6820");
  });

  test("nothing is accrued once the invoice arrives, or with no history", () => {
    assert.equal(applyAccrualRules(book(datadog), "Datadog", [100], true), null);
    assert.equal(applyAccrualRules(book(datadog), "Datadog", [], false), null);
  });
});

describe("backtestRule", () => {
  test("counts firings, correct answers and the regressions a controller reads first", () => {
    const r = rule({ kind: "coding", predicate: [{ op: "vendor_is", value: "Figma" }], action: { type: "code", glCode: "6830", deptSplit: { PROD: 1 } } });
    const result = backtestRule(r, [
      { periodCode: "2026-01", subjectRef: "A", ctx: { vendorName: "Figma" }, expected: "6830|PROD:100" },
      { periodCode: "2026-02", subjectRef: "B", ctx: { vendorName: "Figma" }, expected: "6830|ENG:100" },
      { periodCode: "2026-02", subjectRef: "C", ctx: { vendorName: "Linear" }, expected: "6830|ENG:100" },
    ]);
    assert.equal(result.wouldHaveFired, 2);
    assert.equal(result.wouldHaveBeenCorrect, 1);
    assert.equal(result.precision, 0.5);
    assert.deepEqual(result.periodsReplayed, ["2026-01", "2026-02"]);
    assert.equal(result.regressions[0].subjectRef, "B");
  });
});
