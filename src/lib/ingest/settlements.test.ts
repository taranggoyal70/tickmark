import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readSettlements } from "./settlements";
import { BankRow, LedgerRow, parseMoneyCents } from "./schema";

const csv = (rows: string[]) => rows.join("\n");

describe("readSettlements", () => {
  test("expands a payout into the deposit, gross revenue and the fee, which net to zero", () => {
    const out = readSettlements(csv([
      "transaction_id,settlement_date,gross_amount,fee,net_amount,currency",
      "txn_8891,2026-05-14,4200.00,126.00,4074.00,USD",
    ]), { processor: "Dodo" });

    assert.equal(out.rejected.length, 0);
    assert.equal(out.bank.length, 1);
    assert.equal(out.ledger.length, 2);
    assert.equal(out.bank[0].amount, "4074.00");
    // debit-positive: the deposit and the ledger lines that explain it cancel
    const total = [...out.bank, ...out.ledger].reduce((s, r) => s + parseMoneyCents(r.amount), 0);
    assert.equal(total, 0);
    assert.equal(out.ledger.find((r) => r.gl_code === "4010")?.amount, "-4200.00");
    assert.equal(out.ledger.find((r) => r.gl_code === "6410")?.amount, "126.00");
    assert.deepEqual(out.mapping, {
      id: "transaction_id", date: "settlement_date", gross: "gross_amount", fee: "fee", net: "net_amount", currency: "currency",
    });
  });

  test("its rows pass the same schemas a customer's export does", () => {
    const out = readSettlements(csv(["id,date,amount,fee,net", "p1,2026-05-14,100.00,3.20,96.80"]));
    for (const r of out.bank) assert.equal(BankRow.safeParse(r).success, true);
    for (const r of out.ledger) assert.equal(LedgerRow.safeParse(r).success, true);
  });

  test("refuses a settlement whose arithmetic does not hold", () => {
    const out = readSettlements(csv(["id,date,gross,fee,net", "p1,2026-05-14,900.00,27.00,880.00"]));
    assert.equal(out.bank.length, 0);
    assert.match(out.rejected[0].reason, /gross 900\.00 less fee 27\.00 is 873\.00, but net is 880\.00/);
  });

  test("derives net from gross and fee, and gross from net and fee", () => {
    const a = readSettlements(csv(["id,date,gross,fee", "p1,2026-05-14,100.00,3.00"]));
    assert.equal(a.bank[0].amount, "97.00");
    const b = readSettlements(csv(["id,date,fee,net", "p1,2026-05-14,3.00,97.00"]));
    assert.equal(b.ledger.find((r) => r.gl_code === "4010")?.amount, "-100.00");
  });

  test("refuses rows with no date column, an unreadable amount, or a zero payout", () => {
    assert.match(readSettlements(csv(["id,gross,fee,net", "p1,1,0,1"])).rejected[0].reason, /no settlement date/);
    assert.match(readSettlements(csv(["id,date,gross,fee,net", "p1,2026-05-14,1.005,0,1.005"])).rejected[0].reason, /decimal places/);
    assert.match(readSettlements(csv(["id,date,gross,fee,net", "p1,2026-05-14,0,0,0"])).rejected[0].reason, /zero/);
  });
});
