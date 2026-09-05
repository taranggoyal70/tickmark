import { createClient } from "@supabase/supabase-js";
import type { SimulationReport } from "../agent/simulate";
import type { RunStore } from "./index";

/**
 * Server-only. RLS denies the anon key everything; all access is through
 * Clerk-authenticated server code holding the service role.
 */
export function supabaseStore(): RunStore {
  const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  return {
    kind: "supabase",
    async saveReport(report) {
      const { error } = await client.from("simulation_reports").insert({
        entity_name: report.entity,
        model: report.model,
        generated_at: report.generatedAt,
        payload: report,
      });
      if (error) throw new Error(`supabase save failed: ${error.message}`);
    },
    async loadLatest() {
      const { data, error } = await client
        .from("simulation_reports")
        .select("payload")
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`supabase load failed: ${error.message}`);
      return (data?.payload as SimulationReport) ?? null;
    },
  };
}
