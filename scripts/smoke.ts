/**
 * The built app, requested the way a visitor would.
 *
 *   npm run build && npm run smoke
 *
 * Every page renders per request, so a passing `next build` says nothing about
 * whether a page renders. This starts `next start` on a free port, requests
 * every public route, and checks the status, the content type and one thing
 * each response must contain, plus the security headers.
 *
 * It needs no credentials: without a database or Clerk keys the app runs
 * read-only and every route must still answer. It only sends GET requests, so
 * pointed at a configured database it reads and never writes.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";

interface Check {
  path: string;
  status: number | number[];
  /** content-type prefix */
  type?: string;
  /** something the body must contain */
  has?: string;
  headers?: Record<string, RegExp>;
}

const HTML = "text/html";
const title = (t: string) => `<title>${t} · Tickmark</title>`;

const CHECKS: Check[] = [
  {
    path: "/", status: 200, type: HTML, has: "Models guess.",
    headers: {
      "x-frame-options": /^DENY$/,
      "x-content-type-options": /^nosniff$/,
      "strict-transport-security": /^max-age=\d+/,
      "content-security-policy": /frame-ancestors 'none'/,
      "referrer-policy": /^strict-origin-when-cross-origin$/,
    },
  },
  { path: "/close/run", status: 200, type: HTML, has: title("Close room") },
  { path: "/close", status: 200, type: HTML, has: title("Close performance") },
  { path: "/close/rulebook", status: 200, type: HTML, has: title("Rulebook") },
  { path: "/close/reconciliation", status: 200, type: HTML, has: title("Bank reconciliation") },
  { path: "/close/cash", status: 200, type: HTML, has: title("Cash") },
  { path: "/close/entries", status: 200, type: HTML, has: title("Journal entries") },
  { path: "/close/binder", status: 200, type: HTML, has: title("Close binder") },
  // explained in place without Clerk keys; with them, a signed-out visitor is sent to sign in
  { path: "/close/exceptions", status: [200, 307] },
  { path: "/setup", status: [200, 307] },
  { path: "/sign-in", status: 200, type: HTML, has: title("Sign in") },
  { path: "/sign-up", status: 200, type: HTML, has: title("Create an account") },
  { path: "/ao", status: 200, type: HTML, has: title("Built with AO") },
  { path: "/no-such-page", status: 404, type: HTML, has: "in the books" },
  { path: "/robots.txt", status: 200, type: "text/plain", has: "Sitemap: " },
  { path: "/sitemap.xml", status: 200, type: "application/xml", has: "<urlset" },
  { path: "/manifest.webmanifest", status: 200, type: "application/manifest+json", has: '"name":"Tickmark"' },
  { path: "/api/health", status: 200, type: "application/json", has: '"status":"ok"' },
  { path: "/opengraph-image", status: 200, type: "image/png" },
  { path: "/icon.svg", status: 200, type: "image/svg+xml" },
  { path: "/favicon.ico", status: 200, type: "image/x-icon" },
  { path: "/apple-icon.png", status: 200, type: "image/png" },
  { path: "/icon-512.png", status: 200, type: "image/png" },
];

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(30)} ${detail}`);
};

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = createServer();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as AddressInfo;
      s.close(() => resolve(port));
    });
  });

async function main() {
  if (!existsSync(".next/BUILD_ID")) {
    console.error("no production build: run `npm run build` first.");
    process.exit(2);
  }
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port), "-H", "127.0.0.1"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  const keep = (b: Buffer) => { log = (log + b.toString()).slice(-4000); };
  server.stdout.on("data", keep);
  server.stderr.on("data", keep);
  let exited = false;
  server.on("exit", () => { exited = true; });
  const stop = () => { if (!exited) server.kill("SIGTERM"); };
  process.on("SIGINT", () => { stop(); process.exit(130); });

  try {
    // ready when it answers at all; the health check is asserted below
    const deadline = Date.now() + 60_000;
    for (;;) {
      if (exited) throw new Error(`next start exited:\n${log}`);
      if (Date.now() > deadline) throw new Error(`next start did not answer within 60s:\n${log}`);
      try { await fetch(`${base}/robots.txt`); break; } catch { await new Promise((r) => setTimeout(r, 250)); }
    }
    console.log(`smoke testing the production build on ${base}\n`);

    for (const c of CHECKS) {
      const res = await fetch(base + c.path, { redirect: "manual" });
      const want = Array.isArray(c.status) ? c.status : [c.status];
      const type = res.headers.get("content-type") ?? "";
      const problems: string[] = [];
      if (!want.includes(res.status)) problems.push(`status ${res.status}, want ${want.join(" or ")}`);
      if (c.type && !type.startsWith(c.type)) problems.push(`type ${type || "none"}`);
      const body = c.type?.startsWith("image/") ? null : await res.text();
      if (body === null && (await res.arrayBuffer()).byteLength === 0) problems.push("empty image");
      if (c.has && !body?.includes(c.has)) problems.push(`missing ${JSON.stringify(c.has)}`);
      for (const [h, re] of Object.entries(c.headers ?? {})) {
        if (!re.test(res.headers.get(h) ?? "")) problems.push(`header ${h}: ${res.headers.get(h) ?? "absent"}`);
      }
      check(c.path, problems.length === 0, problems.join("; ") || `${res.status} ${type.split(";")[0]}`);
    }
  } finally {
    stop();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) console.log(`\nlast server output:\n${log}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
