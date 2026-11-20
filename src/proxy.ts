import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { authConfigured } from "@/lib/auth";

/**
 * Makes auth() available to the app. Deliberately does no route matching:
 * Clerk 7 deprecates createRouteMatcher because path matching can diverge from
 * how Next actually routes a request, leaving a protected resource reachable.
 * The check lives next to the data instead: every server action that writes,
 * src/app/close/exceptions/layout.tsx and src/app/api/binder/route.ts.
 */
// Without Clerk keys the app is read-only and every write path treats the
// visitor as signed out (src/lib/auth.ts), so there is nothing to attach.
export default authConfigured() ? clerkMiddleware() : () => NextResponse.next();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
