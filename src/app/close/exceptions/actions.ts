"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { adoptRule, resolveException, type ResolveOutcome } from "@/lib/store/queue";

/** Whoever is signed in owns the judgment. Adoption has to name someone. */
async function actorName(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error("not signed in");
  const u = await currentUser();
  return u?.fullName ?? u?.primaryEmailAddress?.emailAddress ?? userId;
}

export async function resolveAction(
  exceptionId: string, decision: Record<string, unknown>, alwaysDoThis: boolean,
): Promise<ResolveOutcome> {
  const actor = await actorName();
  const outcome = await resolveException(exceptionId, decision, actor, alwaysDoThis);
  revalidatePath("/close/exceptions");
  revalidatePath("/close/rulebook");
  return outcome;
}

export async function adoptAction(ruleId: string, accept: boolean) {
  const actor = await actorName();
  const outcome = await adoptRule(ruleId, actor, accept);
  revalidatePath("/close/exceptions");
  revalidatePath("/close/rulebook");
  return outcome;
}
