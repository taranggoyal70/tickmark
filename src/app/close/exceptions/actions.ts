"use server";

import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { memberEntityIds } from "@/lib/access";
import { signedInUserId } from "@/lib/auth";
import { adoptRule, resolveException, type ResolveOutcome } from "@/lib/store/queue";

/**
 * Whoever is signed in owns the judgment, and only on books they are a member
 * of: the scope goes into the query, so an id from someone else's queue
 * matches nothing.
 */
async function actor(): Promise<{ name: string; scope: string[] }> {
  const userId = await signedInUserId();
  if (!userId) throw new Error("not signed in");
  const u = await currentUser();
  return {
    name: u?.fullName ?? u?.primaryEmailAddress?.emailAddress ?? userId,
    scope: await memberEntityIds(userId),
  };
}

export async function resolveAction(
  exceptionId: string, decision: Record<string, unknown>, alwaysDoThis: boolean,
): Promise<ResolveOutcome> {
  const { name, scope } = await actor();
  const outcome = await resolveException(exceptionId, decision, name, alwaysDoThis, scope);
  revalidatePath("/close/exceptions");
  revalidatePath("/close/rulebook");
  return outcome;
}

export async function adoptAction(ruleId: string, accept: boolean) {
  const { name, scope } = await actor();
  const outcome = await adoptRule(ruleId, name, accept, scope);
  revalidatePath("/close/exceptions");
  revalidatePath("/close/rulebook");
  return outcome;
}
