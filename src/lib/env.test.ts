import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { envNumber } from "./env";

const KEY = "TICKMARK_TEST_NUMBER";
afterEach(() => { delete process.env[KEY]; });

describe("envNumber", () => {
  test("unset or blank falls back", () => {
    assert.equal(envNumber(KEY, 7), 7);
    process.env[KEY] = "  ";
    assert.equal(envNumber(KEY, 7), 7);
  });

  test("reads a valid number", () => {
    process.env[KEY] = "2.5";
    assert.equal(envNumber(KEY, 0), 2.5);
  });

  test("a typo fails loudly instead of becoming NaN", () => {
    process.env[KEY] = "0.8O";
    assert.throws(() => envNumber(KEY, 0), /TICKMARK_TEST_NUMBER must be a number/);
    process.env[KEY] = "-1";
    assert.throws(() => envNumber(KEY, 0), />= 0/);
    process.env[KEY] = "1.5";
    assert.throws(() => envNumber(KEY, 0, { integer: true, min: 1 }), /an integer >= 1/);
  });
});
