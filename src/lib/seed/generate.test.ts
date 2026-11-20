import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, test } from "node:test";
import { VENDORS } from "./fixture";
import { generateAll } from "./generate";

const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

describe("generator", () => {
  test("the bundled sample company is pinned byte for byte", () => {
    // sample-books/ and every recorded report were produced from this output
    assert.equal(digest(generateAll()), "b915580ccf434389a3ef98eb6553ba07ceb6f2919db941ae308dcb968c9a3b96");
  });

  test("a different seed re-draws the books but keeps them internally consistent", () => {
    const [a] = generateAll({ seed: 7 });
    const [b] = generateAll();
    assert.notEqual(digest(a), digest(b));
    for (const inv of a.apInvoices) assert.ok(a.truth.coding[inv.invoiceNumber], inv.invoiceNumber);
    const bankIds = new Set(a.bankLines.map((l) => l.externalId));
    const ledgerIds = new Set(a.ledgerEntries.map((l) => l.externalId));
    for (const m of a.truth.matches) {
      for (const id of m.bankExternalIds) assert.ok(bankIds.has(id));
      for (const id of m.ledgerExternalIds) assert.ok(ledgerIds.has(id));
    }
  });

  test("every true match nets to within its stated residual", () => {
    for (const p of generateAll({ seed: 11, periods: ["2026-01", "2026-02", "2026-03"] })) {
      for (const m of p.truth.matches) {
        const bank = m.bankExternalIds.reduce((s, id) => s + p.bankLines.find((l) => l.externalId === id)!.amountCents, 0);
        const led = m.ledgerExternalIds.reduce((s, id) => s + p.ledgerEntries.find((l) => l.externalId === id)!.amountCents, 0);
        const tol = m.deltaReason === "fx" ? Math.abs(bank) * 0.02 : 2;
        assert.ok(Math.abs(bank + led) <= tol, `${p.code} ${m.bankExternalIds.join("+")} off by ${bank + led}`);
      }
    }
  });

  test("a policy change applies from its period on, and only to its vendor", () => {
    const drift = { vendor: "Digi-Key Electronics", fromIndex: 2, glCode: "5010", deptSplit: { ENG: 1 } };
    const periods = generateAll({ drift });
    for (const [i, p] of periods.entries()) {
      for (const inv of p.apInvoices) {
        const t = p.truth.coding[inv.invoiceNumber];
        if (inv.vendorName === drift.vendor) assert.deepEqual(t.deptSplit, i >= 2 ? { ENG: 1 } : { OPS: 1 });
        else assert.deepEqual(t.deptSplit, VENDORS.find((v) => v.name === inv.vendorName)!.deptSplit);
      }
    }
  });
});
