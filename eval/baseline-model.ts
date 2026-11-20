/**
 * The offline baseline: a deterministic stand-in for the model.
 *
 * It implements the same model interface the close calls, so every batch goes
 * through the real pipeline and every call is counted where a real call would
 * be. Unlike the mechanism test's stand-in it never sees the answer key. It
 * answers only from the prompt, with the kind of heuristics a bookkeeper's
 * spreadsheet would use:
 *
 *   coding     the vendor's most frequent coding in the supplied history,
 *              else the account whose name best overlaps the description
 *   matching   a ledger group for the vendor named in the narrative whose
 *              total equals the bank line, else within 2% (called fx), else a
 *              single entry for exactly the amount
 *   gradient   proposes nothing, so every rule in an offline run comes from
 *              the deterministic correction compilers
 *
 * Token counts are estimates (characters / 4) because there is no tokenizer
 * for a stand-in. Reports label them as estimates.
 */
import { MockLanguageModelV4 } from "ai/test";
import { normalizeRuleText } from "../src/lib/agent/rule-signature";
import { parseCsv, parseMoneyCents } from "../src/lib/ingest/schema";

type Row = Record<string, string>;

/** Read every TOON table (`name[N]{a,b}:` plus N indented rows) out of a prompt. */
export function readToonTables(text: string): Record<string, Row[]> {
  const out: Record<string, Row[]> = {};
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const head = /^(\w+)\[(\d+)\]\{([^}]*)\}:$/.exec(lines[i].trim());
    if (!head) continue;
    const n = Number(head[2]);
    const body = lines.slice(i + 1, i + 1 + n).map((l) => l.replace(/^ {2}/, ""));
    // parseCsv folds header case, so read positionally and restore the names
    const fields = head[3].split(",");
    out[head[1]] = parseCsv([fields.map((_, j) => `f${j}`).join(","), ...body].join("\n"))
      .map((r) => Object.fromEntries(fields.map((f, j) => [f, r[`f${j}`] ?? ""])));
    i += n;
  }
  return out;
}

const words = (s: string) => new Set(normalizeRuleText(s).toLowerCase().split(" ").filter((w) => w.length > 2));

function parseSplit(s: string): { dept: string; weight: number }[] {
  return s.split("/").filter(Boolean).map((part) => {
    const [dept, pct] = part.split(":");
    return { dept, weight: Number(pct) / 100 };
  });
}

function code(system: string, prompt: string) {
  const sys = readToonTables(system);
  const t = readToonTables(prompt);
  const history = t.vendor_history ?? [];
  const accounts = (sys.accounts ?? []).filter((a) => a.type === "expense");
  const fallbackDept = sys.departments?.find((d) => d.code === "GA")?.code ?? sys.departments?.[0]?.code ?? "";

  const decisions = (t.uncoded_invoices ?? []).map((inv) => {
    const seen = history
      .filter((h) => h.vendor === inv.vendor)
      .sort((a, b) => Number(b.timesSeen) - Number(a.timesSeen) || b.lastPeriod.localeCompare(a.lastPeriod));
    if (seen.length) {
      return {
        invoiceNumber: inv.num, glCode: seen[0].glCode, deptSplit: parseSplit(seen[0].deptSplit),
        confidence: 0.9, reasoning: `history: coded this way ${seen[0].timesSeen}x`,
      };
    }
    const want = words(`${inv.vendor} ${inv.desc}`);
    let best = accounts[0], score = -1;
    for (const a of accounts) {
      const s = [...words(a.name)].filter((w) => want.has(w)).length;
      if (s > score) { best = a; score = s; }
    }
    return {
      invoiceNumber: inv.num, glCode: best?.code ?? "", deptSplit: [{ dept: fallbackDept, weight: 1 }],
      confidence: 0.3, reasoning: "no history; best account-name overlap",
    };
  });
  return { decisions };
}

function match(prompt: string) {
  const t = readToonTables(prompt);
  const ledger = (t.ledger_candidates ?? []).map((e) => ({
    id: e.id, vendor: e.vendor, memo: e.memo, cents: parseMoneyCents(e.amount),
  }));
  const used = new Set<string>();
  const matches: unknown[] = [];
  const unmatchable: { bankExternalId: string; why: string }[] = [];

  for (const b of t.bank_lines ?? []) {
    const bankCents = parseMoneyCents(b.amount);
    const narrative = normalizeRuleText(b.desc);
    const free = ledger.filter((e) => !used.has(e.id));

    // the vendor whose first word the bank narrative prints
    const vendor = [...new Set(free.map((e) => e.vendor).filter(Boolean))]
      .find((v) => narrative.split(" ").includes(normalizeRuleText(v).split(" ")[0]));
    const groups = new Map<string, typeof free>();
    for (const e of free.filter((x) => vendor && x.vendor === vendor)) {
      (groups.get(e.memo) ?? groups.set(e.memo, []).get(e.memo)!).push(e);
    }

    let pick: { ids: string[]; delta: string; conf: number; why: string } | null = null;
    for (const g of groups.values()) {
      const sum = g.reduce((s, e) => s + e.cents, 0);
      if (sum + bankCents === 0) { pick = { ids: g.map((e) => e.id), delta: "none", conf: 0.9, why: "vendor group ties exactly" }; break; }
    }
    if (!pick) {
      for (const g of groups.values()) {
        const sum = g.reduce((s, e) => s + e.cents, 0);
        if (Math.abs(sum + bankCents) <= Math.abs(bankCents) * 0.02) { pick = { ids: g.map((e) => e.id), delta: "fx", conf: 0.6, why: "vendor group within 2%" }; break; }
      }
    }
    if (!pick) {
      const exact = free.find((e) => e.cents + bankCents === 0);
      if (exact) pick = { ids: [exact.id], delta: "none", conf: 0.8, why: "single entry for exactly the amount" };
    }

    if (pick) {
      pick.ids.forEach((id) => used.add(id));
      matches.push({ bankExternalIds: [b.id], ledgerExternalIds: pick.ids, deltaReason: pick.delta, confidence: pick.conf, reasoning: pick.why });
    } else {
      unmatchable.push({ bankExternalId: b.id, why: "no ledger group ties to this line" });
    }
  }
  return { matches, unmatchable };
}

const textOf = (prompt: unknown): { system: string; user: string } => {
  const msgs = prompt as { role: string; content: string | { type: string; text?: string }[] }[];
  const join = (role: string) => msgs.filter((m) => m.role === role)
    .map((m) => (typeof m.content === "string" ? m.content : m.content.map((p) => p.text ?? "").join("")))
    .join("\n");
  return { system: join("system"), user: join("user") };
};

export function baselineModel() {
  return new MockLanguageModelV4({
    modelId: "offline-baseline",
    doGenerate: async (options) => {
      const { system, user } = textOf(options.prompt);
      const answer = user.includes("uncoded_invoices") ? code(system, user)
        : user.includes("bank_lines") ? match(user)
        : user.includes("corrections") ? { rules: [] }
        : {};
      const text = JSON.stringify(answer);
      const tokensIn = Math.ceil((system.length + user.length) / 4);
      const tokensOut = Math.ceil(text.length / 4);
      return {
        content: [{ type: "text" as const, text }],
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage: {
          inputTokens: { total: tokensIn, noCache: tokensIn, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: tokensOut, text: tokensOut, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });
}
