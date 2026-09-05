/**
 * Where close runs are persisted.
 *
 * Supabase is the intended system of record. It is reached through this seam
 * rather than imported directly, so the product is never blocked on a
 * provisioning step: with credentials present the Supabase adapter is used, and
 * without them runs land on the filesystem. Same interface either way.
 */
import type { SimulationReport } from "../agent/simulate";

export interface RunStore {
  readonly kind: "supabase" | "file";
  saveReport(report: SimulationReport): Promise<void>;
  loadLatest(): Promise<SimulationReport | null>;
}

export const hasSupabase = () =>
  Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function getStore(): Promise<RunStore> {
  if (hasSupabase()) {
    const { supabaseStore } = await import("./supabase");
    return supabaseStore();
  }
  const { fileStore } = await import("./file");
  return fileStore();
}
