import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // this repo is nested under a parent that also has a lockfile
  turbopack: { root: path.join(__dirname) },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // HTTPS only, for two years. No includeSubDomains: other hosts under
          // a custom domain are not this app's to decide for.
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
          // The parts of a CSP that cannot break Clerk. A script-src policy
          // needs the Clerk instance's domains and a test against live keys.
          { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
