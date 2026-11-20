"use client";

import { useSyncExternalStore } from "react";

/**
 * Light or dark, remembered per browser. The choice lives on <html
 * data-theme>, set before paint by the script in the root layout; with no
 * choice stored the page follows the OS. The button names the theme it
 * switches to.
 */

function subscribe(onChange: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  mq.addEventListener("change", onChange);
  return () => { obs.disconnect(); mq.removeEventListener("change", onChange); };
}

function isDark() {
  const set = document.documentElement.dataset.theme;
  if (set === "dark" || set === "light") return set === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** True or false once the client knows the theme; null during server render. */
export function useIsDark() {
  return useSyncExternalStore(subscribe, isDark, () => null);
}

export function ThemeToggle() {
  // null on the server: render a stable label until the client knows
  const dark = useIsDark();

  const flip = () => {
    const next = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch { /* private mode: the choice lasts this page */ }
  };

  return (
    <button
      type="button"
      onClick={flip}
      className="focus-ring h-7 rounded-[var(--radius-sm)] px-2 font-mono text-[11.5px] font-medium text-muted transition-colors hover:bg-[var(--line)] hover:text-ink"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {dark ? "Light" : "Dark"}
    </button>
  );
}
