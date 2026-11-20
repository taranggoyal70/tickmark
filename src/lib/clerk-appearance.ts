import type { ComponentProps } from "react";
import type { SignIn } from "@clerk/nextjs";

/**
 * Clerk's widgets wear the same paper and ink as the rest of the product.
 *
 * Plain hex per theme, mirroring the tokens in globals.css: Clerk derives its
 * hover and border shades from these values, so they must be real colours.
 * Typed against Clerk's own props so a renamed variable fails the typecheck
 * instead of being ignored.
 */
type Appearance = NonNullable<ComponentProps<typeof SignIn>["appearance"]>;

const PALETTE = {
  light: {
    ink: "#161513", paper: "#fbfaf8", input: "#ffffff", muted: "#706d66", danger: "#b23a0f",
    border: "rgb(22 21 19 / 0.17)",
    shadow: "0 1px 0 rgb(22 21 19 / 0.04), 0 12px 32px -18px rgb(40 32 20 / 0.22)",
  },
  dark: {
    ink: "#eceae4", paper: "#171716", input: "#0f0f0e", muted: "#8d8a83", danger: "#ff8a64",
    border: "rgb(236 234 228 / 0.15)",
    shadow: "0 1px 0 rgb(0 0 0 / 0.3), 0 12px 32px -18px rgb(0 0 0 / 0.6)",
  },
} as const;

export function clerkAppearance(theme: "light" | "dark" = "light"): Appearance {
  const c = PALETTE[theme];
  return {
    variables: {
      colorPrimary: c.ink,
      colorPrimaryForeground: c.paper,
      colorBackground: c.paper,
      colorInput: c.input,
      colorInputForeground: c.ink,
      colorForeground: c.ink,
      colorMutedForeground: c.muted,
      colorNeutral: c.ink,
      colorDanger: c.danger,
      colorShadow: theme === "dark" ? "#000000" : "#282014",
      borderRadius: "8px",
      fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
      fontFamilyMono: "var(--font-geist-mono), ui-monospace, monospace",
      fontSize: "14px",
    },
    elements: {
      card: { border: `1px solid ${c.border}`, boxShadow: c.shadow },
      headerTitle: { letterSpacing: "-0.03em", fontWeight: 500 },
      footer: { background: "transparent" },
    },
  };
}
