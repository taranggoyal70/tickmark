import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import type { LanguageModel } from "ai";
import { effectiveModelId, resolveModel } from "./provider";

const ENV_KEYS = [
  "TICKMARK_API_KEY",
  "TICKMARK_BASE_URL",
  "TICKMARK_MODEL",
  "TICKMARK_SUPPORTS_STRUCTURED_OUTPUTS",
] as const;

const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

function structuredOutputsEnabled(model: LanguageModel): boolean {
  return typeof model === "object" && model !== null &&
    "supportsStructuredOutputs" in model &&
    model.supportsStructuredOutputs === true;
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("resolveModel OpenAI-compatible structured outputs", () => {
  test("keeps structured outputs disabled by default", () => {
    process.env.TICKMARK_BASE_URL = "http://localhost:11434/v1";
    delete process.env.TICKMARK_SUPPORTS_STRUCTURED_OUTPUTS;

    assert.equal(structuredOutputsEnabled(resolveModel("test-model")), false);
  });

  test("enables structured outputs when explicitly opted in", () => {
    process.env.TICKMARK_BASE_URL = "http://localhost:11434/v1";
    process.env.TICKMARK_SUPPORTS_STRUCTURED_OUTPUTS = "1";

    assert.equal(structuredOutputsEnabled(resolveModel("test-model")), true);
  });

  test("does not enable structured outputs for other values", () => {
    process.env.TICKMARK_BASE_URL = "http://localhost:11434/v1";
    process.env.TICKMARK_SUPPORTS_STRUCTURED_OUTPUTS = "true";

    assert.equal(structuredOutputsEnabled(resolveModel("test-model")), false);
  });
});

describe("custom-endpoint accounting", () => {
  test("records the model actually served instead of the requested fallback id", () => {
    process.env.TICKMARK_BASE_URL = "http://localhost:11434/v1";
    process.env.TICKMARK_MODEL = "llama3.2:1b";

    assert.equal(effectiveModelId("anthropic/claude-opus-5"), "llama3.2:1b");
  });
});
