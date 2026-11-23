import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/mark";

export const metadata: Metadata = { title: "Page not found" };

/** Any address the app has no page for, and every notFound() below the root. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="wrap flex h-[60px] items-center">
        <Logo />
      </header>
      <main id="main" className="wrap flex flex-1 flex-col justify-center pb-[14vh] pt-10">
        <div className="eyebrow mb-5"><span className="text-signal">404</span> · Page not found</div>
        <h1 className="display-lg m-0 max-w-[18ch] text-ink">This page isn&rsquo;t in the books.</h1>
        <p className="lede mt-6 max-w-[50ch]">
          The link may be out of date, or the address mistyped. The close room replays a whole
          month-end close on the demo company, and the results start on the front page.
        </p>
        <div className="mt-9 flex flex-wrap gap-2.5">
          <Link href="/close/run" className="btn btn-primary">Open the close room <span className="arrow">→</span></Link>
          <Link href="/" className="btn">Front page</Link>
        </div>
      </main>
    </div>
  );
}
