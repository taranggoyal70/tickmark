"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Logo } from "@/components/mark";

/**
 * A page that threw while rendering. In production the server's message is
 * withheld from the browser; the digest is what ties this screen to the
 * server log, so it is shown for a person to quote.
 */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  const digest = error instanceof Error && "digest" in error ? String(error.digest ?? "") : "";

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      {/* a client boundary cannot export metadata; React hoists this into the head */}
      <title>Something went wrong · Tickmark</title>
      <header className="wrap flex h-[60px] items-center">
        <Logo />
      </header>
      <main id="main" className="wrap flex flex-1 flex-col justify-center pb-[14vh] pt-10">
        <div className="eyebrow mb-5"><span className="text-signal">Error</span> · This page failed</div>
        <h1 className="display-lg m-0 max-w-[18ch] text-ink">Something went wrong on our side.</h1>
        <p className="lede mt-6 max-w-[50ch]">
          The page hit an error while it was being prepared. Trying again usually works. If it
          keeps happening, the reference below matches the server&rsquo;s log.
        </p>
        {digest ? <p className="mt-4 font-mono text-[12px] text-muted">ref {digest}</p> : null}
        <div className="mt-9 flex flex-wrap gap-2.5">
          <button type="button" onClick={() => retry()} className="btn btn-primary">Try again</button>
          <Link href="/" className="btn">Front page</Link>
        </div>
      </main>
    </div>
  );
}
