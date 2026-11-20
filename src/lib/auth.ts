/**
 * Sign-in is optional. With Clerk keys configured, writes need a signed-in
 * user; without them the app runs read-only, as a public demo over synthetic
 * books, and every write path behaves as if nobody is signed in. That keeps a
 * fresh clone runnable with no provisioning, the same as the eval and the
 * filesystem store.
 */

/** Both keys present. Safe to call on the server and, for the public key, the client. */
export const authConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

/** The signed-in user's id, or null when nobody is signed in or sign-in is not configured. */
export async function signedInUserId(): Promise<string | null> {
  if (!authConfigured()) return null;
  const { auth } = await import("@clerk/nextjs/server");
  return (await auth()).userId;
}
