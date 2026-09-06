import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { generateAll } from "../seed/generate";
import { splitKey } from "./close";
import { compileCorrectionRules, type CorrectionRecord } from "./gradient";

const firstPeriod = generateAll()[0];
const repeatedVendor = firstPeriod.apInvoices
  .map((invoice) => invoice.vendorName)
  .find((vendor, index, vendors) => vendors.indexOf(vendor) !== index)!;
const invoices = firstPeriod.apInvoices.filter((invoice) => invoice.vendorName === repeatedVendor).slice(0, 2);

const correction = (index: number): CorrectionRecord => {
  const invoice = invoices[index];
  const truth = firstPeriod.truth.coding[invoice.invoiceNumber];
  return {
    id: `COR-TEST-${index + 1}`, kind: "coding", period: firstPeriod.code,
    subject: invoice.invoiceNumber, vendor: invoice.vendorName,
    agentSaid: "(no proposal)", humanSaid: `${truth.glCode}|${splitKey(truth.deptSplit)}`,
    note: "recoded", glCode: truth.glCode, deptSplit: truth.deptSplit,
    amountCents: invoice.amountCents,
  };
};

describe("deterministic correction compiler", () => {
  test("compiles two agreeing structured corrections into a backtested proposal", () => {
    const rules = compileCorrectionRules([correction(0), correction(1)], [firstPeriod]);

    assert.equal(rules.length, 1);
    assert.equal(rules[0].evidence.length, 2);
    assert.ok((rules[0].backtest?.wouldHaveFired ?? 0) >= 2);
    assert.equal(rules[0].backtest?.precision, 1);
  });

  test("refuses to compile conflicting corrections", () => {
    const conflicting = correction(1);
    conflicting.glCode = "9999";
    conflicting.humanSaid = `9999|${splitKey(conflicting.deptSplit ?? {})}`;

    assert.equal(compileCorrectionRules([correction(0), conflicting], [firstPeriod]).length, 0);
  });
});
