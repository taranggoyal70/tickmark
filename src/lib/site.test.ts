import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { siteUrl } from "./site";

const KEYS = ["NEXT_PUBLIC_SITE_URL", "VERCEL_PROJECT_PRODUCTION_URL"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

describe("siteUrl", () => {
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  test("an explicit site URL wins over the Vercel production domain", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://tickmark.example ";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "tickmark.vercel.app";
    assert.equal(siteUrl().origin, "https://tickmark.example");
  });

  test("on Vercel without one, the production domain, over https", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "tickmark.vercel.app";
    assert.equal(siteUrl().origin, "https://tickmark.vercel.app");
  });

  test("locally, or when the value is not a URL, localhost", () => {
    for (const k of KEYS) delete process.env[k];
    assert.equal(siteUrl().origin, "http://localhost:3000");
    process.env.NEXT_PUBLIC_SITE_URL = "not a url";
    assert.equal(siteUrl().origin, "http://localhost:3000", "a typo must not take the metadata down");
  });
});
