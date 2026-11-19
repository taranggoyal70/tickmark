import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { generateAll } from "../seed/generate";
import { splitKey } from "./close";
import {
  applyToRulebook, commonNarrative, compileCorrectionRules, compileMatchingRules, findContradictions,
  suspendContradicted, wouldAdopt, type CorrectionRecord,
} from "./gradient";
import type { Rule } from "./types";

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

// ── learning from a changed policy, and noticing it ─────────────────────────

const coded = (id: string, period: string, glCode: string, deptSplit: Record<string, number>, vendor = repeatedVendor): CorrectionRecord => ({
  id, kind: "coding", period, subject: `${id}-INV`, vendor,
  agentSaid: "(no proposal)", humanSaid: `${glCode}|${splitKey(deptSplit)}`, note: "recoded",
  glCode, deptSplit, amountCents: 1000, subjectText: "components",
});

describe("a policy that changed", () => {
  test("the newest two agreeing corrections compile, and replay only from the change", () => {
    const old = coded("C1", "2026-01", "5010", { OPS: 1 });
    const older = coded("C2", "2026-02", "5010", { OPS: 1 });
    const now1 = coded("C3", "2026-04", "5010", { ENG: 1 });
    const now2 = coded("C4", "2026-05", "5010", { ENG: 1 });
    const [rule] = compileCorrectionRules([now2, old, now1, older], [firstPeriod]);

    assert.equal(rule.action.type === "code" && rule.action.deptSplit.ENG, 1);
    assert.deepEqual(rule.evidence.map((e) => e.correctionId), ["C3", "C4"]);
    assert.equal(rule.effectiveFrom, "2026-04");
    assert.deepEqual(rule.backtest?.periodsReplayed, []);
  });

  test("one correction after a change is an anecdote, not a new rule", () => {
    const rows = [coded("C1", "2026-01", "5010", { OPS: 1 }), coded("C2", "2026-02", "5010", { OPS: 1 }), coded("C3", "2026-04", "5010", { ENG: 1 })];
    assert.equal(compileCorrectionRules(rows, [firstPeriod]).length, 0);
  });
});

describe("contradictions", () => {
  const active: Rule = {
    id: "R-1", kind: "coding", name: "old", status: "active", version: 1, evidence: [], backtest: null,
    hitCount: 0, createdAt: "2026-03-01T00:00:00.000Z",
    predicate: [{ op: "vendor_is", value: repeatedVendor }],
    action: { type: "code", glCode: "5010", deptSplit: { OPS: 1 } },
  };

  test("a correction an active rule would have decided differently is found", () => {
    const found = findContradictions({ version: 3, rules: [active] }, [
      coded("C9", "2026-04", "5010", { ENG: 1 }),
      coded("C8", "2026-04", "5010", { OPS: 1 }),
      coded("C7", "2026-04", "5010", { ENG: 1 }, "Someone Else"),
    ]);
    assert.deepEqual(found.map((c) => c.correctionId), ["C9"]);
    assert.equal(found[0].ruleSaid, "5010|OPS:100");
    assert.equal(found[0].humanSaid, "5010|ENG:100");
  });

  test("a contradicted rule is suspended, kept on file, and the version moves", () => {
    const rb = suspendContradicted({ version: 3, rules: [active] }, [{ ruleId: "R-1", correctionId: "C9", ruleSaid: "", humanSaid: "", subject: "" }]);
    assert.equal(rb.version, 4);
    assert.equal(rb.rules[0].status, "disabled");
    assert.equal(rb.rules[0].suspendedBy, "C9");
    assert.deepEqual(suspendContradicted(rb, []), rb);
  });

  test("disabled and proposed rules contradict nothing", () => {
    for (const status of ["disabled", "proposed"] as const) {
      assert.equal(findContradictions({ version: 1, rules: [{ ...active, status }] }, [coded("C9", "2026-04", "5010", { ENG: 1 })]).length, 0);
    }
  });
});

describe("matching corrections", () => {
  const all = generateAll();
  const flexportCorrections: CorrectionRecord[] = all.slice(0, 2).flatMap((p) => p.truth.matches
    .filter((m) => m.cardinality === "many:1")
    .map((m, i) => {
      const b = p.bankLines.find((x) => x.externalId === m.bankExternalIds[0])!;
      return {
        id: `M-${p.code}-${i}`, kind: "matching" as const, period: p.code, subject: b.externalId, vendor: "Flexport",
        agentSaid: "unmatched", humanSaid: "many:1", note: "partial", amountCents: b.amountCents,
        subjectText: b.description, shape: { cardinality: m.cardinality, deltaReason: m.deltaReason },
      };
    }));

  test("the settlement shape is learned from the replay, not declared", () => {
    const rules = compileMatchingRules(flexportCorrections, all.slice(0, 3));
    assert.ok(rules.length >= 1);
    for (const r of rules) {
      assert.equal(r.action.type === "match" && r.action.strategy, "installments");
      assert.equal(r.backtest?.precision, 1);
      assert.ok(r.evidence.length >= 2);
    }
  });

  test("the shared narrative drops references that change every month", () => {
    assert.equal(commonNarrative(["FLEXPORT INC SAN FRANCIS TRANCHE 1/2", "FLEXPORT INC SAN FRANCIS TRANCHE 2/2"]), "FLEXPORT INC SAN FRANCIS TRANCHE");
    assert.equal(commonNarrative(["STRIPE PAYOUT88368363", "STRIPE PAYOUT1234"]), "STRIPE");
    assert.equal(commonNarrative(["AWS EMEA SARL", "AMZN WEB SVCS"]), "");
  });
});

describe("adoption", () => {
  const proposal = (fired: number, precision: number, evidence = 2): Rule => ({
    id: `P-${fired}-${precision}`, kind: "coding", name: "p", status: "proposed", version: 1, hitCount: 0,
    createdAt: "2026-03-01T00:00:00.000Z", predicate: [{ op: "vendor_is", value: "X" }],
    action: { type: "code", glCode: "6830", deptSplit: { ENG: 1 } },
    evidence: Array.from({ length: evidence }, (_, i) => ({ correctionId: `C${i}`, periodCode: "2026-01", quote: "q", subjectRef: "s" })),
    backtest: { periodsReplayed: ["2026-01"], wouldHaveFired: fired, wouldHaveBeenCorrect: Math.round(fired * precision), wouldHaveBeenWrong: 0, regressions: [], precision },
  });

  test("needs two pieces of evidence, two replayed firings and 95% precision", () => {
    assert.equal(wouldAdopt(proposal(2, 1)), true);
    assert.equal(wouldAdopt(proposal(1, 1)), false);
    assert.equal(wouldAdopt(proposal(10, 0.9)), false);
    assert.equal(wouldAdopt(proposal(2, 1, 1)), false);
    assert.equal(wouldAdopt({ ...proposal(2, 1), backtest: null }), false);
  });

  test("an equivalent later proposal is kept as evidence but never runs twice", () => {
    const first = applyToRulebook({ version: 0, rules: [] }, [proposal(2, 1)]);
    const again = applyToRulebook(first, [{ ...proposal(3, 1), id: "P-dup" }]);
    assert.equal(again.version, 1);
    assert.equal(again.rules.filter((r) => r.status === "active").length, 1);
    assert.equal(again.rules.find((r) => r.id === "P-dup")?.duplicateOf, first.rules[0].id);
  });
});
