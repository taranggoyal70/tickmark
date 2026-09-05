/**
 * Source of truth for model identity and price. Nothing else hardcodes a rate.
 * Rates are USD per 1M tokens, from the Claude API pricing table.
 */
export const MODELS = {
  "anthropic/claude-opus-5":    { label: "Claude Opus 5",    inPerMTok: 5.0, outPerMTok: 25.0 },
  "anthropic/claude-sonnet-5":  { label: "Claude Sonnet 5",  inPerMTok: 2.0, outPerMTok: 10.0 },
  "anthropic/claude-haiku-4-5": { label: "Claude Haiku 4.5", inPerMTok: 1.0, outPerMTok: 5.0  },
} as const;

export type ModelId = keyof typeof MODELS | (string & {});

/**
 * The default. We do not buy cost savings by downgrading the model - cost falls
 * because the Rulebook removes calls, which is the only saving that also makes
 * the answer more reliable.
 */
export const DEFAULT_MODEL: ModelId = "anthropic/claude-opus-5";

export interface Rate { label: string; inPerMTok: number; outPerMTok: number }

/**
 * Rates for a model. A self-hosted or sponsor-provided endpoint has no public
 * price list, so its rates come from env and default to zero - which reports an
 * honest $0.00 rather than inventing a number.
 */
export function rateFor(model: ModelId): Rate {
  const known = (MODELS as Record<string, Rate>)[model];
  if (known) return known;
  return {
    label: model,
    inPerMTok: Number(process.env.TICKMARK_PRICE_IN ?? 0),
    outPerMTok: Number(process.env.TICKMARK_PRICE_OUT ?? 0),
  };
}

/** Micro-dollars, so run costs stay integers. $1.00 = 1_000_000. */
export function costMicros(model: ModelId, tokensIn: number, tokensOut: number): number {
  const r = rateFor(model);
  return Math.round((tokensIn / 1e6) * r.inPerMTok * 1e6 + (tokensOut / 1e6) * r.outPerMTok * 1e6);
}

export const fmtUsd = (micros: number) => `$${(micros / 1e6).toFixed(4)}`;
