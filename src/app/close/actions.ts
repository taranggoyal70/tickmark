"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { closePeriod } from "@/lib/agent/run-period";

/**
 * Running a close writes to the ledger, so it needs a person behind it even
 * though reading the dashboard does not.
 */
export interface CloseOutcome {
  ok: boolean;
  message: string;
  cleared?: number;
  exceptions?: number;
  tickmarks?: number;
  ruleHits?: number;
  journalEntries?: number;
  costMicros?: number;
  degraded?: boolean;
}

export async function runCloseAction(entity: string, period: string): Promise<CloseOutcome> {
  const { userId } = await auth();
  if (!userId) return { ok: false, message: "Sign in to run a close — it writes to the ledger." };
  const who = await currentUser();

  try {
    const { result, persisted } = await closePeriod(entity, period);
    revalidatePath("/close");
    revalidatePath("/close/exceptions");
    return {
      ok: true,
      message: `${period} closed by ${who?.firstName ?? "you"}.`,
      cleared: result.tickmarked,
      exceptions: persisted.exceptions,
      tickmarks: persisted.tickmarks,
      ruleHits: result.stats.ruleHits,
      journalEntries: persisted.journalEntries,
      costMicros: result.stats.costMicros,
      degraded: result.stats.modelFailures > 0,
    };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
