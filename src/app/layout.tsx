import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { authConfigured } from "@/lib/auth";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"], display: "swap" });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

// Applied before first paint so a chosen theme never flashes the other one.
// It only reads localStorage; without it the page follows the OS setting.
const THEME_INIT = `try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export const metadata: Metadata = {
  title: "Tickmark - the month-end close that learns",
  description:
    "An agent that codes AP invoices and reconciles the bank, hands a controller only what needs judgment, and compiles every correction into a deterministic rule so next month costs less.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const page = (
    <html lang="en" className={`${geist.variable} ${mono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
  // without Clerk keys the app runs read-only and needs no provider
  if (!authConfigured()) return page;
  return (
    <ClerkProvider
      appearance={clerkAppearance()}
      // Clerk titles the widget with the application name, which the Vercel
      // integration created as "tickmark-auth". Say the product's name instead.
      localization={{
        signIn: { start: { title: "Sign in to Tickmark" } },
        signUp: { start: { title: "Create your Tickmark account" } },
      }}
      // keep sign-in inside the product rather than bouncing to a Clerk-hosted
      // domain; set in code so it holds on Vercel without extra env vars
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/close"
      signUpFallbackRedirectUrl="/close"
    >
      {page}
    </ClerkProvider>
  );
}
