import "server-only";
import { getStore } from "./store";
import type { SimulationReport } from "./agent/simulate";

export async function latestReport(): Promise<SimulationReport | null> {
  const store = await getStore();
  return store.loadLatest();
}

export const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`;
export const usdFromMicros = (m: number) => `$${(m / 1e6).toFixed(m < 100_000 ? 4 : 2)}`;
export const minutes = (s: number) => `${Math.round(s / 60)}m`;
