/**
 * Model resolution.
 *
 * Three credential paths, in priority order, because a demo that dies on one
 * missing card is not a demo - and because provider portability is table stakes
 * for anything that wants to run in someone else's account:
 *
 *   1. TICKMARK_BASE_URL  - any OpenAI-compatible endpoint (a sponsor's
 *                           inference gateway, a self-hosted model, OpenRouter)
 *   2. ANTHROPIC_API_KEY  - the Anthropic API directly
 *   3. otherwise          - the plain "provider/model" string via Vercel AI Gateway
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { ModelId } from "./pricing";

/**
 * Test seam. The mechanism test registers a deterministic stand-in here so the
 * whole loop can be exercised without a model credential. Production never
 * calls this.
 */
let override: ((id: ModelId) => LanguageModel) | null = null;
export const setModelOverride = (fn: ((id: ModelId) => LanguageModel) | null) => { override = fn; };

const bare = (id: ModelId) => String(id).replace(/^anthropic\//, "");

export function resolveModel(id: ModelId): LanguageModel {
  if (override) return override(id);

  const baseURL = process.env.TICKMARK_BASE_URL;
  if (baseURL) {
    const provider = createOpenAICompatible({
      name: "tickmark-endpoint",
      baseURL,
      apiKey: process.env.TICKMARK_API_KEY,
      supportsStructuredOutputs:
        process.env.TICKMARK_SUPPORTS_STRUCTURED_OUTPUTS === "1",
    });
    return provider(process.env.TICKMARK_MODEL ?? bare(id));
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (key) return createAnthropic({ apiKey: key })(bare(id));

  return id as LanguageModel;
}

export function providerLabel(): string {
  if (process.env.TICKMARK_BASE_URL) {
    return `OpenAI-compatible endpoint (${new URL(process.env.TICKMARK_BASE_URL).host})`;
  }
  if (process.env.ANTHROPIC_API_KEY) return "Anthropic API (direct)";
  return "Vercel AI Gateway";
}

/** What the run should record as the model actually used. */
export const effectiveModelId = (id: ModelId): ModelId =>
  process.env.TICKMARK_BASE_URL ? (process.env.TICKMARK_MODEL ?? bare(id)) : id;
