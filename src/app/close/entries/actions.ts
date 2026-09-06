"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { decideEntry } from "@/lib/store/entries";

export async function decideEntryAction(id: string, approve: boolean): Promise<{ ok: boolean; message: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, message: "Sign in to approve an entry." };
  const u = await currentUser();
  const approver = u?.fullName ?? u?.primaryEmailAddress?.emailAddress ?? userId;
  try {
    await decideEntry(id, approver, approve);
    revalidatePath("/close/entries");
    return { ok: true, message: approve ? `Posted, approved by ${approver}.` : "Rejected. Nothing was posted." };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
