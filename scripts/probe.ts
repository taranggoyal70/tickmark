import { generateText } from "ai";
import { resolveModel, providerLabel } from "../src/lib/agent/provider";
async function main() {
  console.log("provider:", providerLabel());
  const r = await generateText({ model: resolveModel("anthropic/claude-haiku-4-5"), prompt: "Reply with exactly: OK" });
  console.log("READY ->", r.text.trim());
}
main().catch((e) => { console.error("NOT READY:", (e?.message ?? String(e)).slice(0, 140)); process.exit(1); });
