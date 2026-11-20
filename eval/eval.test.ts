import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readToonTables } from "./baseline-model";
import { DRIFT, HELD_OUT_ROUND_1, HELD_OUT_ROUND_2, heldOutCompany, redrawPolicies } from "./companies";
import { heldOutByClose, runEval } from "./run";
import { VENDORS } from "../src/lib/seed/fixture";
import { toonTable } from "../src/lib/agent/toon";

describe("eval companies", () => {
  test("held-out rounds do not overlap and are not the dev seed", () => {
    const all = [...HELD_OUT_ROUND_1, ...HELD_OUT_ROUND_2];
    assert.equal(new Set(all).size, all.length);
    assert.ok(!all.includes(0 as never));
  });

  test("held-out policies differ from the dev company's and still sum to 100%", () => {
    const redrawn = redrawPolicies(HELD_OUT_ROUND_2[0]);
    const changed = redrawn.filter((v, i) => JSON.stringify(v.deptSplit) !== JSON.stringify(VENDORS[i].deptSplit));
    assert.ok(changed.length >= 10, `${changed.length} vendors changed`);
    for (const v of redrawn) {
      const total = Object.values(v.deptSplit).reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(total - 1) < 1e-9, `${v.name} sums to ${total}`);
    }
  });

  test("the policy-change scenario actually changes the vendor's policy", () => {
    const before = redrawPolicies(DRIFT.seed).find((v) => v.name === DRIFT.vendor)!;
    assert.notDeepEqual(before.deptSplit, DRIFT.deptSplit);
  });

  test("a held-out company is tagged with its round", () => {
    assert.equal(heldOutCompany(HELD_OUT_ROUND_1[0]).round, 1);
    assert.equal(heldOutCompany(HELD_OUT_ROUND_2[0]).round, 2);
  });
});

describe("baseline stand-in", () => {
  test("reads TOON tables back with their field names and quoting", () => {
    const text = `${toonTable("rows", [{ vendorName: "Acme, Inc.", amount: "1.00" }], ["vendorName", "amount"])}\n\nother text`;
    assert.deepEqual(readToonTables(text), { rows: [{ vendorName: "Acme, Inc.", amount: "1.00" }] });
  });
});

describe("the eval itself", () => {
  test("is deterministic, and on held-out round 2 nothing cleared unattended is wrong", async () => {
    const a = await runEval("offline-baseline", new Set(["round2"]), () => {});
    const b = await runEval("offline-baseline", new Set(["round2"]), () => {});
    assert.deepEqual(a.companies.map((c) => c.closes), b.companies.map((c) => c.closes));
    const rows = heldOutByClose(a, 2);
    assert.equal(rows.length, 6);
    assert.equal(rows.reduce((s, r) => s + r.clearedWrong, 0), 0);
    assert.ok(rows[5].modelCalls < rows[0].modelCalls, "rules retire model calls");
  });
});
