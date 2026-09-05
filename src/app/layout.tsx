import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { clerkAppearance } from "@/lib/clerk-appearance";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const mono = JetBrains_Mono({ variable: "--font-mono-face", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Tickmark - the month-end close that learns",
  description:
    "An agent that codes AP invoices and reconciles the bank, hands a controller only what needs judgment, and compiles every correction into a deterministic rule so next month costs less.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider
      appearance={clerkAppearance}
      // keep sign-in inside the product rather than bouncing to a Clerk-hosted
      // domain; set in code so it holds on Vercel without extra env vars
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/close"
      signUpFallbackRedirectUrl="/close"
    >
      <html lang="en" className={`${inter.variable} ${mono.variable} h-full antialiased`}>
        <body className="min-h-full flex flex-col">{children}</body>
      </html>
    </ClerkProvider>
  );
}
