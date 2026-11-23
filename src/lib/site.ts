/**
 * The public origin, for absolute URLs in metadata, social cards, the sitemap
 * and robots.txt.
 *
 * NEXT_PUBLIC_SITE_URL wins, so a custom domain is used once it is set. On
 * Vercel, VERCEL_PROJECT_PRODUCTION_URL names the production domain even on a
 * preview build, so a shared preview link still points its card at production.
 */
export function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const raw = explicit || (vercel ? `https://${vercel}` : "http://localhost:3000");
  try {
    return new URL(raw);
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const SITE = {
  name: "Tickmark",
  tagline: "The month-end close that learns",
  description:
    "An agent that codes AP invoices and reconciles the bank, hands a controller only what needs judgment, and compiles every correction into a deterministic rule, so next month costs less.",
} as const;
