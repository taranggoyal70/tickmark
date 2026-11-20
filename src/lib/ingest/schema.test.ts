import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BankRow, InvoiceRow, LedgerRow, MALFORMED, parseCsv, parseDate, parseMoneyCents } from "./schema";

describe("parseMoneyCents", () => {
  test("reads the formats bank, GL and AP exports actually use", () => {
    assert.equal(parseMoneyCents("1,234.56"), 123456);
    assert.equal(parseMoneyCents("$1,234.56"), 123456);
    assert.equal(parseMoneyCents("(1,234.56)"), -123456);
    assert.equal(parseMoneyCents("-1234.56"), -123456);
    assert.equal(parseMoneyCents("$-4.00"), -400);
    assert.equal(parseMoneyCents("+3.10"), 310);
    assert.equal(parseMoneyCents(" 12 "), 1200);
    assert.equal(parseMoneyCents("12.5"), 1250);
    assert.equal(parseMoneyCents(".5"), 50);
  });

  test("never goes through a float", () => {
    // Number("1234.57") * 100 === 123456.99999999999
    assert.equal(parseMoneyCents("1234.57"), 123457);
    assert.equal(parseMoneyCents("0.29"), 29);
    assert.equal(parseMoneyCents("4503599627370.95"), 450359962737095);
  });

  test("blank is zero, and zero is never negative", () => {
    assert.equal(parseMoneyCents(""), 0);
    assert.equal(Object.is(parseMoneyCents("-0.00"), -0), false);
  });

  test("accepts zero padding but refuses a fraction of a cent", () => {
    assert.equal(parseMoneyCents("12.3400"), 1234);
    assert.throws(() => parseMoneyCents("1.234"), /two decimal places/);
    assert.throws(() => parseMoneyCents("0.005"), /two decimal places/);
  });

  test("refuses what is not an amount instead of guessing", () => {
    for (const bad of ["$", "-", "abc", "1.2.3", "1e5", "(-5)", "12-", "--5"]) {
      assert.throws(() => parseMoneyCents(bad), /not an amount/, bad);
    }
    assert.throws(() => parseMoneyCents("99999999999999999999"), /out of range/);
  });
});

describe("parseDate", () => {
  test("normalises every accepted form to ISO", () => {
    for (const s of ["2026-04-30", "4/30/2026", "04.30.2026", "30 Apr 2026", "Apr 30, 2026", "April 30 2026", "2026-04-30T23:15:00Z"]) {
      assert.equal(parseDate(s), "2026-04-30", s);
    }
  });

  test("refuses impossible calendar dates rather than rolling over", () => {
    for (const bad of ["2026-02-31", "2026-13-01", "13/45/2026", "2/30/2026", "yesterday", ""]) {
      assert.throws(() => parseDate(bad), /not a date/, bad);
    }
    assert.equal(parseDate("2/29/2028"), "2028-02-29");
  });
});

describe("parseCsv", () => {
  test("handles quotes, escaped quotes, CRLF and header variants", () => {
    const rows = parseCsv('Posted Date,DESCRIPTION,amount\r\n2026-01-02,"ACME, INC ""HQ""","$1,240.00"\r\n\r\n');
    assert.deepEqual(rows, [{ posted_date: "2026-01-02", description: 'ACME, INC "HQ"', amount: "$1,240.00" }]);
  });

  test("flags a row whose field count disagrees with the header", () => {
    const [row] = parseCsv("id,amount\nA,$1,240.00\n");
    assert.match(row[MALFORMED], /expected 2 columns, found 3/);
  });

  test("returns nothing for an empty file", () => {
    assert.deepEqual(parseCsv(""), []);
  });
});

describe("row schemas", () => {
  test("a bank row reads money and dates through the strict parsers", () => {
    const r = BankRow.parse({ external_id: "B1", posted_date: "1/2/2026", description: "WIRE", amount: "(10.00)" });
    assert.deepEqual(r, { external_id: "B1", posted_date: "2026-01-02", description: "WIRE", amount: -1000, currency: "USD" });
  });

  test("a bad amount is an issue with a reason, not a zero", () => {
    const r = InvoiceRow.safeParse({ vendor: "V", invoice_number: "1", invoice_date: "2026-01-02", amount: "1.234" });
    assert.equal(r.success, false);
    assert.match(r.error!.issues[0].message, /two decimal places/);
  });

  test("ledger source is constrained to known sources", () => {
    const r = LedgerRow.safeParse({ external_id: "L1", entry_date: "2026-01-02", amount: "1", source: "crypto" });
    assert.equal(r.success, false);
  });
});
