import type { Predicate, Rule } from "./types";

type SemanticRule = Pick<Rule, "kind" | "predicate" | "action">;

/** Keep this in lockstep with how predicate evaluation compares human text. */
export const normalizeRuleText = (value: string) =>
  value.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const canonicalPredicate = (predicate: Predicate): Predicate => ({
  op: predicate.op,
  value: typeof predicate.value === "string" &&
    (predicate.op === "vendor_is" || predicate.op === "desc_contains")
    ? normalizeRuleText(predicate.value)
    : predicate.value,
});

/**
 * A Rule's identity is what it does, never its generated name, period,
 * evidence, backtest, or database id. Predicates are an AND-set, so ordering
 * and repeated clauses do not change the signature. Object keys are sorted,
 * and text compared through the Rulebook's normalizer is normalized here too.
 */
export function semanticRuleSignature(rule: SemanticRule): string {
  const byValue = new Map(
    rule.predicate.map(canonicalPredicate).map((predicate) => [stableJson(predicate), predicate]),
  );
  const predicate = [...byValue.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);
  const action = rule.action.type === "match"
    ? { ...rule.action, vendorName: normalizeRuleText(rule.action.vendorName) }
    : rule.action;
  return stableJson({ kind: rule.kind, predicate, action });
}
