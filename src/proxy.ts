import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Makes auth() available to the app. Deliberately does no route matching:
 * Clerk 7 deprecates createRouteMatcher because path matching can diverge from
 * how Next actually routes a request, leaving a protected resource reachable.
 * The check lives next to the data instead - see src/app/close/layout.tsx.
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
