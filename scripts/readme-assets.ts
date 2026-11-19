/**
 * Generates the README graphics from the recorded eval, so a picture can never
 * drift from the numbers it shows.
 *
 *   npm run readme:assets             write docs/readme/*
 *   npm run readme:assets -- --check  fail if any file differs from what the data produces
 *
 * Every number drawn comes from eval/results/offline.json through
 * heldOutByClose(): held-out round 2, summed over its three companies.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { heldOutByClose, type EvalResults } from "../eval/run";

const OUT = "docs/readme";
const results = JSON.parse(readFileSync("eval/results/offline.json", "utf8")) as EvalResults;
const rows = heldOutByClose(results, 2);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const month = (period: string) => MONTHS[Number(period.slice(5, 7)) - 1];

const calls = rows.map((r) => r.modelCalls + r.gradientCalls);
const ruleShare = rows.map((r) => (r.codingByRule + r.matchByRule) / (r.invoices + r.truthMatches));
const cleared = rows.reduce((s, r) => s + r.cleared, 0);
const clearedWrong = rows.reduce((s, r) => s + r.clearedWrong, 0);
const companies = rows[0].companies;

// ── themes ───────────────────────────────────────────────────────────────────

interface Theme {
  bg: string; panel: string; hairline: string; ink: string; ink2: string; mute: string;
  accent: string; accentSoft: string; card: string; cardInk: string; cardMute: string; cardLine: string;
}
const LIGHT: Theme = {
  bg: "#ffffff", panel: "#f6f9fc", hairline: "#e3e8ee", ink: "#0d253d", ink2: "#273951", mute: "#64748d",
  // validated with the dataviz palette checks against #ffffff
  accent: "#533afd", accentSoft: "#eceafe", card: "#0d253d", cardInk: "#ffffff", cardMute: "#a9b6c9", cardLine: "#26405c",
};
const DARK: Theme = {
  bg: "#0b1020", panel: "#121933", hairline: "#232c47", ink: "#e8ecf5", ink2: "#c3cbe0", mute: "#8e98b0",
  // validated against #0b1020
  accent: "#7a6aff", accentSoft: "#1e2150", card: "#1a1f44", cardInk: "#ffffff", cardMute: "#a7b0cc", cardLine: "#2f3766",
};

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const text = (x: number, y: number, s: string, size: number, fill: string, extra = "") =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}"${extra ? ` ${extra}` : ""}>${esc(s)}</text>`;

/** A bar with 4px rounded data-end, anchored square to the baseline. */
const bar = (x: number, base: number, w: number, h: number, fill: string, cls = "") => {
  const r = Math.min(4, h, w / 2);
  if (h <= 0) return "";
  return `<path${cls ? ` class="${cls}"` : ""} d="M${x} ${base}V${base - h + r}Q${x} ${base - h} ${x + r} ${base - h}H${x + w - r}Q${x + w} ${base - h} ${x + w} ${base - h + r}V${base}Z" fill="${fill}"/>`;
};

// ── the hero ─────────────────────────────────────────────────────────────────

/** Seconds in one loop of the hero animation. */
const LOOP = 12;
/**
 * Start every animation at 75% of its loop, where everything is on screen, so a
 * renderer that snapshots the first frame still shows the finished picture.
 */
const PHASE = `-${LOOP * 0.75}s`;

/**
 * Keyframes for one element: hidden until `start`%, in over `dur`%, held, then
 * all elements fade together before the loop restarts. With reduced motion the
 * animation is off and every element sits in its final, visible state.
 */
function keyframes(name: string, start: number, dur: number, from: string) {
  return `@keyframes ${name}{0%,${start}%{opacity:0;transform:${from}}${start + dur}%,91%{opacity:1;transform:none}97%,100%{opacity:0;transform:none}}`;
}

interface HeroLayout {
  w: number; h: number;
  headline: { x: number; y: number; size: number; lines: string[]; lead: number };
  sub: { y: number; size: number; lines: string[] };
  divider: number;
  labels: { x: number; y: number; s: string }[];
  cards: { x: number; y: number; w: number; h: number }[];
  arrow: { d: string; label?: { x: number; y: number } };
  rule: { x: number; y: number; w: number; h: number };
  chart: { x: number; y: number; w: number; h: number };
}

const SUB = `Six closes at ${companies} held-out companies: model calls ${calls[0]} → ${calls[calls.length - 1]}; ${clearedWrong} of ${cleared} lines cleared unreviewed were wrong.`;

const WIDE: HeroLayout = {
  w: 1280, h: 650,
  headline: { x: 56, y: 172, size: 54, lines: ["Every correction becomes a rule.", "Every rule retires a model call."], lead: 64 },
  sub: { y: 288, size: 21, lines: [SUB] },
  divider: 326,
  labels: [
    { x: 56, y: 370, s: "1 · A CONTROLLER CORRECTS" },
    { x: 468, y: 370, s: "2 · IT COMPILES INTO A RULE" },
    { x: 880, y: 370, s: "3 · MODEL CALLS PER CLOSE" },
  ],
  cards: [{ x: 56, y: 392, w: 364, h: 96 }, { x: 56, y: 500, w: 364, h: 96 }],
  arrow: { d: "M428 494H456" },
  rule: { x: 468, y: 392, w: 380, h: 204 },
  chart: { x: 880, y: 392, w: 344, h: 204 },
};

const NARROW: HeroLayout = {
  w: 480, h: 1190,
  headline: { x: 28, y: 150, size: 40, lines: ["Every correction", "becomes a rule.", "Every rule retires", "a model call."], lead: 46 },
  sub: { y: 334, size: 17, lines: [
    `Six closes at ${companies} held-out companies:`,
    `model calls ${calls[0]} → ${calls[calls.length - 1]}; ${clearedWrong} of ${cleared} lines`,
    "cleared unreviewed were wrong.",
  ] },
  divider: 420,
  labels: [
    { x: 28, y: 456, s: "1 · A CONTROLLER CORRECTS" },
    { x: 28, y: 740, s: "2 · IT COMPILES INTO A RULE" },
    { x: 28, y: 996, s: "3 · MODEL CALLS PER CLOSE" },
  ],
  cards: [{ x: 28, y: 474, w: 424, h: 96 }, { x: 28, y: 582, w: 424, h: 96 }],
  arrow: { d: "M240 686V708" },
  rule: { x: 28, y: 756, w: 424, h: 204 },
  chart: { x: 28, y: 1010, w: 424, h: 150 },
};

function hero(t: Theme, L: HeroLayout): string {
  const css: string[] = [];
  const anim = (cls: string, start: number, dur: number, from: string) => {
    css.push(keyframes(cls, start, dur, from), `.${cls}{animation:${cls} ${LOOP}s cubic-bezier(.2,.7,.2,1) ${PHASE} infinite both}`);
    return cls;
  };
  const body: string[] = [];

  // frame, wordmark, headline
  body.push(`<rect width="${L.w}" height="${L.h}" rx="24" fill="${t.bg}"/>`);
  body.push(`<rect x="0.5" y="0.5" width="${L.w - 1}" height="${L.h - 1}" rx="23.5" fill="none" stroke="${t.hairline}"/>`);
  const lx = L.headline.x;
  body.push(`<rect x="${lx}" y="44" width="36" height="36" rx="9" fill="${t.accent}"/>`);
  body.push(`<path d="M${lx + 9} ${63}l6.5 6.5l12-13" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`);
  body.push(text(lx + 50, 71, "Tickmark", 26, t.ink, `font-weight="650"`));
  body.push(text(L.w - lx, 69, "OPEN SOURCE · MIT", 13, t.mute, `text-anchor="end" letter-spacing="2" font-weight="600"`));
  L.headline.lines.forEach((line, i) =>
    body.push(text(lx - 2, L.headline.y + i * L.headline.lead, line, L.headline.size, t.ink, `font-weight="650" letter-spacing="-1.6"`)));
  L.sub.lines.forEach((line, i) => body.push(text(lx, L.sub.y + i * (L.sub.size + 10), line, L.sub.size, t.mute)));
  body.push(`<line x1="${lx}" y1="${L.divider}" x2="${L.w - lx}" y2="${L.divider}" stroke="${t.hairline}"/>`);
  for (const l of L.labels) body.push(text(l.x, l.y, l.s, 12, t.mute, `letter-spacing="1.6" font-weight="600"`));

  // 1 · two agreeing corrections
  L.cards.forEach((c, i) => {
    const cls = anim(`card${i}`, i === 0 ? 1 : 9, 6, "translateY(10px)");
    body.push(`<g class="${cls}">`,
      `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="12" fill="${t.panel}" stroke="${t.hairline}"/>`,
      `<rect x="${c.x}" y="${c.y + 14}" width="3" height="${c.h - 28}" rx="1.5" fill="${t.accent}"/>`,
      text(c.x + 20, c.y + 28, `${i === 0 ? "JAN" : "FEB"} CLOSE · CORRECTION`, 11.5, t.mute, `letter-spacing="1.4" font-weight="600"`),
      text(c.x + 20, c.y + 54, "Amazon Web Services", 17, t.ink, `font-weight="600"`),
      text(c.x + 20, c.y + 78, "6820 · ENG 60 / DATA 25 / PROD 15", 14, t.ink2, `font-family="${MONO}"`),
      i === 1 ? `<g><rect x="${c.x + c.w - 86}" y="${c.y + 14}" width="68" height="22" rx="11" fill="${t.accentSoft}"/>${text(c.x + c.w - 52, c.y + 29.5, "agrees", 12, t.accent, `text-anchor="middle" font-weight="600"`)}</g>` : "",
      `</g>`);
  });

  // the compile arrow
  const arrowCls = anim("arrow", 16, 6, "translate(0,0)");
  body.push(`<path class="${arrowCls}" d="${L.arrow.d}" stroke="${t.accent}" stroke-width="2.5" stroke-linecap="round" fill="none" marker-end="url(#head)"/>`);

  // 2 · the rule
  const R = L.rule;
  const ruleCls = anim("rule", 22, 7, "scale(.97)");
  css.push(`.${ruleCls}{transform-box:fill-box;transform-origin:50% 50%}`);
  const tickCls = "tick";
  css.push(`@keyframes tick{0%,30%{stroke-dashoffset:30}38%,100%{stroke-dashoffset:0}}`,
    `.tick{stroke-dasharray:30;animation:tick ${LOOP}s ease-out ${PHASE} infinite both}`);
  body.push(`<g class="${ruleCls}">`,
    `<rect x="${R.x}" y="${R.y}" width="${R.w}" height="${R.h}" rx="14" fill="${t.card}"/>`,
    `<rect x="${R.x + 20}" y="${R.y + 18}" width="112" height="24" rx="12" fill="${t.accent}"/>`,
    text(R.x + 76, R.y + 34.5, "RULE · ACTIVE", 11.5, "#ffffff", `text-anchor="middle" letter-spacing="1.2" font-weight="700"`),
    `<circle cx="${R.x + R.w - 36}" cy="${R.y + 30}" r="14" fill="none" stroke="${t.accent}" stroke-width="2"/>`,
    `<path class="${tickCls}" d="M${R.x + R.w - 42} ${R.y + 30}l4.5 4.5l8.5-9" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
    text(R.x + 20, R.y + 72, "WHEN", 11.5, t.cardMute, `letter-spacing="1.4" font-weight="600"`),
    text(R.x + 20, R.y + 94, "vendor is Amazon Web Services", 16, t.cardInk),
    text(R.x + 20, R.y + 124, "THEN", 11.5, t.cardMute, `letter-spacing="1.4" font-weight="600"`),
    text(R.x + 20, R.y + 146, "code 6820 · ENG 60 · DATA 25 · PROD 15", 15, t.cardInk, `font-family="${MONO}"`),
    `<line x1="${R.x + 20}" y1="${R.y + 166}" x2="${R.x + R.w - 20}" y2="${R.y + 166}" stroke="${t.cardLine}"/>`,
    text(R.x + 20, R.y + 189, "backtested on closed months · runs with 0 model calls", 13, t.cardMute),
    `</g>`);

  // 3 · calls per close, the measured curve
  const C = L.chart;
  const max = Math.max(...calls);
  const labelH = 18, axisH = 22;
  const plotTop = C.y + labelH, base = C.y + C.h - axisH;
  const n = calls.length, gap = Math.round(C.w * 0.07), bw = Math.floor((C.w - gap * (n - 1)) / n);
  body.push(`<line x1="${C.x}" y1="${base + 0.5}" x2="${C.x + C.w}" y2="${base + 0.5}" stroke="${t.hairline}"/>`);
  calls.forEach((v, i) => {
    const h = Math.round(((base - plotTop) * v) / max);
    const x = C.x + i * (bw + gap);
    const cls = anim(`b${i}`, 38 + i * 4, 5, "scaleY(0)");
    css.push(`.${cls}{transform-box:fill-box;transform-origin:50% 100%}`);
    body.push(`<g class="${cls}">${bar(x, base, bw, h, t.accent)}${text(x + bw / 2, base - h - 6, String(v), 13, t.ink2, `text-anchor="middle" font-weight="600"`)}</g>`);
    body.push(text(x + bw / 2, base + 17, month(rows[i].period), 12, t.mute, `text-anchor="middle"`));
  });

  const title = "Tickmark: every correction becomes a rule, every rule retires a model call";
  const desc = `Animated illustration. A controller corrects how an Amazon Web Services invoice is coded in January and again in February; ` +
    `the two agreeing corrections compile into an active rule (vendor is Amazon Web Services, code 6820 split ENG 60, DATA 25, PROD 15) ` +
    `that runs with zero model calls. A bar chart shows measured model calls per close across ${companies} held-out companies, ` +
    `${rows.map((r, i) => `${month(r.period)} ${calls[i]}`).join(", ")}. ${clearedWrong} of ${cleared} lines cleared unattended were wrong.`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${L.w}" height="${L.h}" viewBox="0 0 ${L.w} ${L.h}" role="img" aria-labelledby="t d">`,
    `<title id="t">${esc(title)}</title><desc id="d">${esc(desc)}</desc>`,
    `<defs><marker id="head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1L8 5L1 9" fill="none" stroke="${t.accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>`,
    `<style>${css.join("")}@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>`,
    `<g font-family="${SANS}">`, ...body.filter(Boolean), `</g>`,
    `</svg>`,
  ].join("\n") + "\n";
}

/** A share as a percent with one decimal, truncated: a chart never rounds a result up. */
const pctDown = (v: number) => `${(Math.floor(v * 1000 + 1e-9) / 10).toFixed(1)}%`;

// ── the results chart ────────────────────────────────────────────────────────

function resultsChart(t: Theme): string {
  const W = 1200, H = 430, pad = 40, panelW = (W - pad * 3) / 2;
  const body: string[] = [`<rect width="${W}" height="${H}" rx="20" fill="${t.bg}"/>`,
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="19.5" fill="none" stroke="${t.hairline}"/>`];

  const panel = (x0: number, title: string, sub: string, values: number[], fmt: (v: number) => string, max: number, ticks: number[], tickFmt = fmt) => {
    body.push(text(x0, 52, title, 19, t.ink, `font-weight="650"`), text(x0, 76, sub, 14, t.mute));
    const top = 110, base = 360, axisW = 40;
    const plotX = x0 + axisW, plotW = panelW - axisW;
    for (const tk of ticks) {
      const y = base - ((base - top) * tk) / max;
      body.push(`<line x1="${plotX}" y1="${y.toFixed(1)}" x2="${plotX + plotW}" y2="${y.toFixed(1)}" stroke="${t.hairline}" ${tk === 0 ? "" : `stroke-dasharray="2 4"`}/>`);
      body.push(text(plotX - 10, y + 4, tickFmt(tk), 12, t.mute, `text-anchor="end"`));
    }
    const n = values.length, gap = 22, bw = (plotW - gap * (n + 1)) / n;
    values.forEach((v, i) => {
      const h = ((base - top) * v) / max;
      const x = plotX + gap + i * (bw + gap);
      body.push(bar(Number(x.toFixed(1)), base, Number(bw.toFixed(1)), Number(h.toFixed(1)), t.accent));
      body.push(text(x + bw / 2, base - h - 8, fmt(v), 13, t.ink2, `text-anchor="middle" font-weight="600"`));
      body.push(text(x + bw / 2, base + 22, `${month(rows[i].period)}`, 13, t.mute, `text-anchor="middle"`));
      body.push(text(x + bw / 2, base + 40, `close ${i + 1}`, 11, t.mute, `text-anchor="middle"`));
    });
  };
  const maxCalls = Math.ceil(Math.max(...calls) / 10) * 10;
  panel(pad, "Model calls per close", `${companies} held-out companies, close and gradient calls summed`,
    calls, String, maxCalls, Array.from({ length: maxCalls / 10 + 1 }, (_, i) => i * 10));
  panel(pad * 2 + panelW, "Decisions settled by a compiled rule", "share of invoice codings and bank matches made by a rule",
    ruleShare, pctDown, 1, [0, 0.5, 1], (v) => `${v * 100}%`);

  const desc = `Two bar charts from the offline eval over ${companies} held-out companies. Model calls per close: ` +
    `${rows.map((r, i) => `${month(r.period)} ${calls[i]}`).join(", ")}. Share of decisions settled by a compiled rule: ` +
    `${rows.map((r, i) => `${month(r.period)} ${pctDown(ruleShare[i])}`).join(", ")}.`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t d">`,
    `<title id="t">Model calls fall as decisions move to compiled rules</title><desc id="d">${esc(desc)}</desc>`,
    `<g font-family="${SANS}">`, ...body, `</g>`, `</svg>`,
  ].join("\n") + "\n";
}

// ── write or check ───────────────────────────────────────────────────────────

const metrics = {
  source: "eval/results/offline.json via heldOutByClose(results, 2)",
  mode: results.mode, tokenCounts: results.tokenCounts, companies,
  closes: rows.map((r, i) => ({
    period: r.period, modelCalls: calls[i], settledByRule: r.codingByRule + r.matchByRule,
    decisionsToMake: r.invoices + r.truthMatches, cleared: r.cleared, clearedWrong: r.clearedWrong,
  })),
};

const files: Record<string, string> = {
  "hero.svg": hero(LIGHT, WIDE),
  "hero-dark.svg": hero(DARK, WIDE),
  "hero-narrow.svg": hero(LIGHT, NARROW),
  "hero-narrow-dark.svg": hero(DARK, NARROW),
  "results.svg": resultsChart(LIGHT),
  "results-dark.svg": resultsChart(DARK),
  "metrics.json": JSON.stringify(metrics, null, 2) + "\n",
};

const check = process.argv.includes("--check");
let stale = 0;
mkdirSync(OUT, { recursive: true });
for (const [name, content] of Object.entries(files)) {
  const file = path.join(OUT, name);
  if (check) {
    let current = "";
    try { current = readFileSync(file, "utf8"); } catch { /* missing counts as stale */ }
    if (current !== content) { console.error(`stale: ${file}`); stale++; }
  } else {
    writeFileSync(file, content);
  }
}
if (check) {
  if (stale) { console.error(`${stale} README graphic(s) differ from the eval data; run "npm run readme:assets"`); process.exit(1); }
  console.log(`README graphics match eval/results/offline.json (${Object.keys(files).length} files)`);
} else {
  console.log(`wrote ${Object.keys(files).length} files to ${OUT}/`);
}
