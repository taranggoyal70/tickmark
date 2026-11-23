import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * The pages anyone can read. No lastModified: the build time is not when a
 * page's content changed, and a wrong date is worse than none.
 */
const PUBLIC = [
  "/",
  "/close/run",
  "/close",
  "/close/rulebook",
  "/close/reconciliation",
  "/close/cash",
  "/close/entries",
  "/close/binder",
  "/ao",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return PUBLIC.map((path) => ({ url: new URL(path, base).toString() }));
}
