import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import robots from "./robots";
import sitemap from "./sitemap";

const page = (path: string) => join("src/app", path, "page.tsx");

test("every page in the sitemap exists, so a rename cannot leave it pointing at a 404", () => {
  const paths = sitemap().map((e) => new URL(e.url).pathname);
  assert.ok(paths.includes("/"), "the landing page is listed");
  for (const p of paths) assert.ok(existsSync(page(p)), `${p} is in the sitemap but ${page(p)} does not exist`);
});

test("the sitemap lists nothing robots.txt asks crawlers to skip", () => {
  const rules = robots().rules;
  const disallow = (Array.isArray(rules) ? rules : [rules]).flatMap((r) => r.disallow ?? []);
  for (const { url } of sitemap()) {
    const path = new URL(url).pathname;
    assert.ok(!disallow.some((d) => path.startsWith(d)), `${path} is both listed and disallowed`);
  }
});
