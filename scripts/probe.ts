/**
 * Credential check. Answers one question: can the agent reach a model right now?
 *
 *   npm run check
 */
import { generateText } from "ai";
import { providerLabel, resolveModel } from "../src/lib/agent/provider";
import { effectiveModelId } from "../src/lib/agent/provider";
import { DEFAULT_MODEL, rateFor } from "../src/lib/agent/pricing";

async function main() {
  const id = effectiveModelId(DEFAULT_MODEL);
  const rate = rateFor(id);
  console.log(`provider: ${providerLabel()}`);
  console.log(`model:    ${id}  ($${rate.inPerMTok}/$${rate.outPerMTok} per MTok)`);
  const r = await generateText({ model: resolveModel(DEFAULT_MODEL), prompt: "Reply with exactly: OK" });
  console.log(`\nREADY — replied "${r.text.trim()}". Run \`npm run simulate\` for measured numbers.`);
}

main().catch((e) => {
  console.error(`\nNOT READY — ${(e?.message ?? String(e)).slice(0, 220)}`);
  console.error("\nSet one of: TICKMARK_BASE_URL (+ TICKMARK_API_KEY, TICKMARK_MODEL), ANTHROPIC_API_KEY,");
  console.error("or add a card to the Vercel AI Gateway to unlock its free credits. See .env.example.");
  process.exit(1);
});
