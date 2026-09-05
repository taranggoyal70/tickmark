/**
 * Model resolution.
 *
 * Two credential paths, because a demo that dies on one missing card is not a
 * demo. A direct ANTHROPIC_API_KEY wins when present; otherwise the plain
 * "provider/model" string routes through the Vercel AI Gateway.
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import type { ModelId } from "./pricing";

export function resolveModel(id: ModelId): LanguageModel {
  const key = process.env.ANTHROPIC_API_KEY;
  if (key) {
    const anthropic = createAnthropic({ apiKey: key });
    return anthropic(id.replace(/^anthropic\//, ""));
  }
  return id; // Vercel AI Gateway
}

export const providerLabel = () =>
  process.env.ANTHROPIC_API_KEY ? "Anthropic API (direct)" : "Vercel AI Gateway";
