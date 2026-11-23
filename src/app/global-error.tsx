"use client";

/**
 * The last resort: the root layout itself failed, so this page brings its own
 * document and none of the app's styles. Kept to system fonts and inline CSS
 * so nothing it depends on can be what broke.
 */
const CSS = `
:root { color-scheme: light dark; --bg: #f3f2ee; --ink: #161513; --muted: #706d66; --signal: #e2501d; --line: rgb(22 21 19 / 0.17); }
@media (prefers-color-scheme: dark) { :root { --bg: #0f0f0e; --ink: #eceae4; --muted: #8d8a83; --signal: #ff6a3d; --line: rgb(236 234 228 / 0.15); } }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: flex; align-items: center; background: var(--bg); color: var(--ink);
  font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
main { width: 100%; max-width: 1200px; margin: 0 auto; padding: 48px clamp(16px, 4vw, 40px) 14vh; }
.eyebrow { font: 500 11px/1.2 ui-monospace, Menlo, monospace; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
.eyebrow b { color: var(--signal); font-weight: 500; }
h1 { margin: 20px 0 0; max-width: 18ch; font-size: clamp(34px, 4.4vw, 60px); font-weight: 500; line-height: 1.02; letter-spacing: -0.042em; }
p { max-width: 50ch; color: var(--muted); }
.ref { font: 12px/1.5 ui-monospace, Menlo, monospace; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 32px; }
.actions > * { font: 500 14px/1 inherit; padding: 12px 18px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: var(--ink); text-decoration: none; cursor: pointer; }
.actions > .primary { background: var(--ink); border-color: var(--ink); color: var(--bg); }
.actions > *:focus-visible { outline: 2px solid var(--signal); outline-offset: 2px; }
`;

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String(error.digest ?? "") : "";
  return (
    <html lang="en">
      <body>
        <title>Something went wrong · Tickmark</title>
        <style>{CSS}</style>
        <main>
          <div className="eyebrow"><b>Error</b> · Tickmark failed to load</div>
          <h1>Something went wrong on our side.</h1>
          <p>The app hit an error before this page could render. Trying again usually works. If it keeps happening, the reference below matches the server&rsquo;s log.</p>
          {digest ? <p className="ref">ref {digest}</p> : null}
          <div className="actions">
            <button type="button" className="primary" onClick={() => retry()}>Try again</button>
            {/* a full page load on purpose: the app's own navigation is what failed */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/">Front page</a>
          </div>
        </main>
      </body>
    </html>
  );
}
