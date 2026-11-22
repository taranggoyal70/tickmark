import { createClient } from "@supabase/supabase-js";
import { authConfigured } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Probe = "ok" | "down" | "unconfigured";

/**
 * For an uptime monitor. 200 while the app can serve; 503 when the database
 * it is configured with does not answer within three seconds. The body says
 * nothing that is not already public: no hostnames and no error text.
 */
export async function GET() {
  const database = await probeDatabase();
  return Response.json(
    {
      status: database === "down" ? "degraded" : "ok",
      database,
      auth: authConfigured() ? "configured" : "off",
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    },
    { status: database === "down" ? 503 : 200, headers: { "cache-control": "no-store" } },
  );
}

async function probeDatabase(): Promise<Probe> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // without a database the app still serves the recorded run read-only
  if (!url || !key) return "unconfigured";
  try {
    const { error } = await createClient(url, key, { auth: { persistSession: false } })
      .from("entities").select("id").limit(1)
      .abortSignal(AbortSignal.timeout(3000));
    return error ? "down" : "ok";
  } catch {
    return "down";
  }
}
