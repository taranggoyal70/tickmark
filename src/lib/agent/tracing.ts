/**
 * Optional tracing.
 *
 * Neatlogs is a debugging aid, not a dependency. If NEATLOGS_API_KEY is absent
 * every function here is inert and the agent behaves identically - a close run
 * must never fail, slow down, or change a number because observability is
 * unconfigured.
 *
 * What makes the traces worth reading is the metadata: each span records which
 * pass it belongs to, the period, the batch size, and the rulebook version. Put
 * side by side across periods, a trace shows the residue shrinking as the
 * Rulebook takes work away from the model - which is the whole claim.
 */

export interface TraceContext {
  pass: "coding" | "matching" | "gradient";
  periodCode?: string;
  rulebookVersion?: number;
  batchSize?: number;
}

const enabled = () => Boolean(process.env.NEATLOGS_API_KEY);

let started: Promise<boolean> | null = null;

/** Idempotent. Returns false when tracing is off or the SDK failed to load. */
export function initTracing(): Promise<boolean> {
  if (!enabled()) return Promise.resolve(false);
  started ??= (async () => {
    try {
      const { init } = await import("neatlogs");
      await init({
        apiKey: process.env.NEATLOGS_API_KEY,
        workflowName: "tickmark-close",
        tags: ["office-of-the-cfo", "month-end-close"],
      });
      return true;
    } catch {
      // observability must never take the close down with it
      return false;
    }
  })();
  return started;
}

type Telemetry = Record<string, unknown> | undefined;

/**
 * An AI SDK `experimental_telemetry` config, or undefined when tracing is off.
 * Undefined is the documented "no telemetry" value, so callers can spread this
 * unconditionally.
 */
export async function telemetryFor(ctx: TraceContext): Promise<Telemetry> {
  if (!(await initTracing())) return undefined;
  try {
    const { createAITelemetry } = await import("neatlogs/ai");
    return createAITelemetry({
      metadata: {
        pass: ctx.pass,
        period: ctx.periodCode ?? "",
        rulebookVersion: ctx.rulebookVersion ?? 0,
        batchSize: ctx.batchSize ?? 0,
      },
    }) as unknown as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Flush before a CLI exits, or spans from a short run are lost. */
export async function flushTracing(): Promise<void> {
  if (!enabled() || !started) return;
  try {
    const { flush } = await import("neatlogs");
    await flush();
  } catch { /* never fail a run on a flush */ }
}

export const tracingLabel = () => (enabled() ? "Neatlogs" : "off");
