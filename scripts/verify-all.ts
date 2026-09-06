/**
 * One command a reviewer can run to watch every guarantee in this repo hold.
 *
 * The claims are spread across a type-checker, a linter, a headless eval, and
 * two suites that talk to the live database. Asking someone to run five things
 * in the right order is asking them not to bother.
 */
import { spawn } from "node:child_process";

type Stage = { name: string; cmd: string; args: string[]; needsDb?: boolean };

const STAGES: Stage[] = [
  { name: "types",         cmd: "npx", args: ["tsc", "--noEmit"] },
  { name: "lint",          cmd: "npm", args: ["run", "lint"] },
  { name: "loop wiring",   cmd: "npm", args: ["run", "selftest"] },
  { name: "db invariants", cmd: "npm", args: ["run", "verify:db"],   needsDb: true },
  { name: "evidence gate", cmd: "npm", args: ["run", "verify:gate"], needsDb: true },
  { name: "close loop",    cmd: "npm", args: ["run", "verify:loop"], needsDb: true },
  { name: "import",        cmd: "npm", args: ["run", "verify:import"], needsDb: true },
  { name: "settlements",   cmd: "npm", args: ["run", "verify:settlements"] },
];

const hasDb = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const allowPartialVerify = process.env.ALLOW_PARTIAL_VERIFY === "1";

const run = (s: Stage) =>
  new Promise<{ code: number; tail: string }>((resolve) => {
    const p = spawn(s.cmd, s.args, { stdio: ["ignore", "pipe", "pipe"] });
    let tail = "";
    const keep = (b: Buffer) => { tail = (tail + b.toString()).slice(-1400); };
    p.stdout.on("data", keep);
    p.stderr.on("data", keep);
    p.on("close", (code) => resolve({ code: code ?? 1, tail }));
  });

async function main() {
  console.log("verifying every guarantee\n");
  let failed = 0;

  for (const s of STAGES) {
    if (s.needsDb && !hasDb) {
      console.log(`  SKIP  ${s.name.padEnd(15)} needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY`);
      continue;
    }
    // No in-progress marker: this output is read piped as often as on a tty,
    // and a cursor escape that leaks into a log is worse than no spinner.
    const { code, tail } = await run(s);
    if (code === 0) {
      console.log(`  PASS  ${s.name}`);
    } else {
      failed++;
      console.log(`  FAIL  ${s.name} (exit ${code})`);
      console.log(tail.trimEnd().split("\n").map((l) => `        ${l}`).join("\n"));
      break;
    }
  }

  const incomplete = failed === 0 && !hasDb && !allowPartialVerify;
  console.log(failed > 0
    ? `\n${failed} stage(s) failed`
    : incomplete
      ? "\nverification incomplete  (database suites skipped)"
      : `\neverything holds${hasDb ? "" : "  (database suites skipped by ALLOW_PARTIAL_VERIFY=1)"}`);
  process.exit(failed === 0 && !incomplete ? 0 : 1);
}

main().catch((e) => { console.error("verify-all crashed:", e?.message ?? e); process.exit(1); });
