"use client";

import { SignIn, SignUp, UserButton } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { useIsDark } from "./theme-toggle";

/**
 * Clerk's widgets, following the page's light or dark theme. The provider in
 * the root layout carries the light appearance; these override it per widget
 * with whichever theme the page is showing, and re-render when it flips.
 */
function useClerkAppearance() {
  return clerkAppearance(useIsDark() ? "dark" : "light");
}

export function ThemedSignIn() {
  return <SignIn appearance={useClerkAppearance()} />;
}

export function ThemedSignUp() {
  return <SignUp appearance={useClerkAppearance()} />;
}

export function ThemedUserButton() {
  const appearance = useClerkAppearance();
  return (
    <UserButton
      appearance={{ ...appearance, elements: { ...appearance.elements, avatarBox: { width: 26, height: 26 } } }}
    />
  );
}
