"use server";

import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { claimCloseSlot, closesPerDay, isEntityId, memberEntityIds } from "@/lib/access";
import { signedInUserId } from "@/lib/auth";
import { closePeriod } from "@/lib/agent/run-period";

/**
 * Running a close writes to the ledger and spends model calls, so it needs a
 * person behind it, books they are a member of, and a close left in their
 * daily allowance. Reading the dashboard needs none of that.
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

export async function runCloseAction(entityId: string, period: string): Promise<CloseOutcome> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, message: "Sign in to run a close. It writes to the ledger." };
  if (!isEntityId(entityId) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    return { ok: false, message: "Pick one of your entities and a period like 2026-05." };
  }
  if (!(await memberEntityIds(userId)).includes(entityId)) {
    return { ok: false, message: "You can only close books you imported." };
  }
  const limit = closesPerDay();
  if (limit === 0) return { ok: false, message: "Closing from the browser is turned off on this deployment." };
  if (!(await claimCloseSlot(userId, entityId, period))) {
    return {
      ok: false,
      message: `You have run ${limit} closes in the last 24 hours, the limit on this deployment. It frees up as each one ages past a day.`,
    };
  }
  const who = await currentUser();

  try {
    const { result, persisted } = await closePeriod(entityId, period);
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
    // the detail goes to the server log, not to the browser
    console.error("close failed", e);
    return { ok: false, message: "The close could not finish. Try again; the reason is in the server log." };
  }
}
