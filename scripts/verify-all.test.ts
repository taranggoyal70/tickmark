import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import test from "node:test";

const verifyAll = resolve("scripts/verify-all.ts");

function runVerifyAll(overrides: Record<string, string | undefined> = {}) {
  const binDir = mkdtempSync(join(tmpdir(), "tickmark-verify-all-"));
  const passThroughCommand = "#!/bin/sh\nexit 0\n";

  for (const command of ["npm", "npx"]) {
    const path = join(binDir, command);
    writeFileSync(path, passThroughCommand);
    chmodSync(path, 0o755);
  }

  const env = { ...process.env, ...overrides };
  delete env.SUPABASE_URL;
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  delete env.ALLOW_PARTIAL_VERIFY;
  Object.assign(env, overrides, { PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}` });

  try {
    return spawnSync(process.execPath, ["--import", "tsx", verifyAll], {
      cwd: process.cwd(),
      env,
      encoding: "utf8",
    });
  } finally {
    rmSync(binDir, { recursive: true, force: true });
  }
}

test("verify:all fails when database suites are skipped by default", () => {
  const result = runVerifyAll();

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stdout, /SKIP\s+db invariants/);
});

test("verify:all permits skipped database suites when explicitly allowed", () => {
  const result = runVerifyAll({ ALLOW_PARTIAL_VERIFY: "1" });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /database suites skipped by ALLOW_PARTIAL_VERIFY=1/);
});
