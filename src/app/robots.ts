import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * Crawl the public pages; skip what only works for a signed-in controller and
 * the API. Vercel already marks preview deployments noindex, so this speaks for
 * production only.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/close/exceptions", "/setup", "/sign-in", "/sign-up"],
    },
    sitemap: new URL("/sitemap.xml", siteUrl()).toString(),
  };
}
