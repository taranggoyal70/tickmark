"use client";

import { useId, useState } from "react";

/**
 * Categorical theme, fixed order, never cycled. Validated against the dark
 * chart surface (#ffffff) with scripts/validate_palette.js: lightness band,
 * chroma floor and adjacent CVD separation all pass. The aqua sits just under
 * 3:1 on white, which the validator flags as needing relief rather than
 * failing - satisfied here by the always-present legend, direct labels and the
 * table view on every chart. Do not reorder or add a fourth hue without
 * re-running the validator.
 */
export const SERIES = {
  rule:      { color: "#2a78d6", label: "Settled by rule" },
  model:     { color: "#1baf7a", label: "Decided by model" },
  exception: { color: "#eb6834", label: "Sent to controller" },
} as const;

const SURFACE = "#ffffff";
const GRID = "#e3e8ee";
const INK_SUBTLE = "#64748d";

const W = 660, H = 200, PAD_L = 44, PAD_R = 16, PAD_T = 16, PAD_B = 30;
const PW = W - PAD_L - PAD_R, PH = H - PAD_T - PAD_B;

function niceMax(v: number) {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    if (v <= step * mag) return step * mag;
  }
  return 10 * mag;
}

interface Point { label: string; value: number }

/**
 * Formatting is named, not passed as a function. Server Components cannot hand
 * a closure across the boundary, so the chart owns the formatter and the page
 * names which one it wants.
 */
export type FormatKind = "pct" | "pct1" | "usd3" | "usd0" | "minutes" | "count";

const FORMATTERS: Record<FormatKind, (v: number) => string> = {
  pct: (v) => `${(v * 100).toFixed(0)}%`,
  pct1: (v) => `${(v * 100).toFixed(1)}%`,
  usd3: (v) => `$${v.toFixed(3)}`,
  usd0: (v) => (v < 0 ? `-$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`),
  minutes: (v) => `${Math.round(v)}m`,
  count: (v) => String(Math.round(v)),
};

/**
 * One measure over time. A single series needs no legend - the title names it.
 * Never paired with a second y-axis; a second measure gets its own chart.
 */
export function TrendLine({
  title, note, points, format, domainMax, goodDirection = "up",
}: {
  title: string; note?: string; points: Point[];
  format: FormatKind; domainMax?: number;
  goodDirection?: "up" | "down" | "flat";
}) {
  const fmt = FORMATTERS[format];
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const id = useId();

  const max = domainMax ?? niceMax(Math.max(...points.map((p) => p.value)) * 1.15);
  const x = (i: number) => PAD_L + (points.length === 1 ? PW / 2 : (i / (points.length - 1)) * PW);
  const y = (v: number) => PAD_T + PH - (v / max) * PH;

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${path} L${x(points.length - 1).toFixed(1)},${PAD_T + PH} L${x(0).toFixed(1)},${PAD_T + PH} Z`;

  const first = points[0]?.value ?? 0, last = points[points.length - 1]?.value ?? 0;
  const delta = last - first;
  const improving = goodDirection === "flat" ? Math.abs(delta) < 1e-9 : goodDirection === "up" ? delta > 0 : delta < 0;
  // Categorical slot 1. Status hues are reserved for state and never paint a
  // series; direction is carried by the caption below, in words.
  const accent = SERIES.rule.color;

  return (
    <figure className="panel p-5 m-0">
      <figcaption className="mb-1 flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-medium text-ink">{title}</h3>
        <button
          onClick={() => setShowTable((s) => !s)}
          className="focus-ring text-[11px] text-ink-tertiary hover:text-ink-subtle rounded px-1"
        >
          {showTable ? "chart" : "table"}
        </button>
      </figcaption>
      {note ? <p className="mb-3 text-[12px] leading-snug text-ink-subtle">{note}</p> : null}

      {showTable ? (
        <table className="w-full text-[13px] nums">
          <thead><tr className="text-ink-subtle text-left"><th className="py-1 font-medium">Period</th><th className="py-1 font-medium text-right">Value</th></tr></thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.label} className="border-t border-[var(--hairline)]">
                <td className="py-1.5 text-ink-muted">{p.label}</td>
                <td className="py-1.5 text-right text-ink">{fmt(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img"
               aria-label={`${title}. ${points.map((p) => `${p.label} ${fmt(p.value)}`).join(", ")}.`}>
            <defs>
              <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity="0.13" />
                <stop offset="100%" stopColor={accent} stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* recessive grid */}
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <g key={t}>
                <line x1={PAD_L} x2={W - PAD_R} y1={PAD_T + PH * t} y2={PAD_T + PH * t} stroke={GRID} strokeWidth="1" />
                <text x={PAD_L - 8} y={PAD_T + PH * t + 4} textAnchor="end" fontSize="10" fill={INK_SUBTLE} className="nums">
                  {fmt(max * (1 - t))}
                </text>
              </g>
            ))}

            <path d={area} fill={`url(#g-${id})`} />
            <path d={path} fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

            {points.map((p, i) => (
              <g key={p.label}>
                <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill={INK_SUBTLE}>{p.label}</text>
                {hover === i ? <line x1={x(i)} x2={x(i)} y1={PAD_T} y2={PAD_T + PH} stroke={GRID} strokeWidth="1" /> : null}
                {/* 2px surface ring keeps the marker legible where it overlaps the line */}
                <circle cx={x(i)} cy={y(p.value)} r={hover === i ? 6 : 4.5} fill={accent} stroke={SURFACE} strokeWidth="2" />
                {/* hit target larger than the mark */}
                <rect x={x(i) - PW / (points.length * 2)} y={PAD_T} width={PW / points.length} height={PH}
                      fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
              </g>
            ))}

            {/* selective direct labels: the endpoints only, never every point */}
            {/* keep the endpoint label off the top gridline label when the
                series is pinned near the ceiling */}
            <text
              x={x(points.length - 1)}
              y={y(last) - PAD_T < 20 ? y(last) + 20 : y(last) - 12}
              textAnchor="end" fontSize="12" fontWeight="600" fill="#0d253d" className="nums"
            >
              {fmt(last)}
            </text>
          </svg>

          {hover !== null ? (
            <div className="pointer-events-none absolute top-2 right-2 rounded-[var(--radius-md)] border border-hairline bg-surface-2 px-2.5 py-1.5 text-[12px] shadow-lg">
              <div className="text-ink-subtle">{points[hover].label}</div>
              <div className="nums font-medium text-ink">{fmt(points[hover].value)}</div>
            </div>
          ) : null}
        </div>
      )}

      {goodDirection !== "flat" && !showTable ? (
        <p className="mt-3 text-[12px] text-ink-tertiary">
          {improving ? "Improving" : "Worsening"} — {fmt(first)} in {points[0]?.label} to {fmt(last)} in {points[points.length - 1]?.label}.
        </p>
      ) : null}
      {goodDirection === "flat" && !showTable ? (
        <p className="mt-3 text-[12px] text-ink-tertiary">
          {improving ? "Held flat" : "Moved"} across all {points.length} periods. This one is supposed to stay put.
        </p>
      ) : null}
    </figure>
  );
}

/**
 * Where each decision came from, period by period. Three series, so a legend is
 * always present and each segment is also direct-labeled - identity is never
 * carried by colour alone.
 */
export function DecisionMix({
  title, note, categories, series,
}: {
  title: string; note?: string; categories: string[];
  series: { key: keyof typeof SERIES; values: number[] }[];
}) {
  const [hover, setHover] = useState<{ c: number; s: number } | null>(null);
  const totals = categories.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
  const max = niceMax(Math.max(...totals, 1));

  const bw = Math.min(64, (PW / categories.length) * 0.56);
  const cx = (i: number) => PAD_L + (PW / categories.length) * (i + 0.5);

  return (
    <figure className="panel p-5 m-0">
      <figcaption className="mb-1">
        <h3 className="text-[15px] font-medium text-ink">{title}</h3>
      </figcaption>
      {note ? <p className="mb-3 text-[12px] leading-snug text-ink-subtle">{note}</p> : null}

      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted">
            <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: SERIES[s.key].color }} />
            {SERIES[s.key].label}
          </span>
        ))}
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img"
             aria-label={`${title}. ${categories.map((c, i) => `${c}: ${series.map((s) => `${SERIES[s.key].label} ${s.values[i]}`).join(", ")}`).join("; ")}.`}>
          {[0, 0.5, 1].map((t) => (
            <line key={t} x1={PAD_L} x2={W - PAD_R} y1={PAD_T + PH * t} y2={PAD_T + PH * t} stroke={GRID} strokeWidth="1" />
          ))}

          {categories.map((c, i) => {
            let acc = 0;
            return (
              <g key={c}>
                {series.map((s, si) => {
                  const v = s.values[i] ?? 0;
                  const h = (v / max) * PH;
                  const yTop = PAD_T + PH - acc - h;
                  acc += h;
                  const isTop = si === series.length - 1;
                  if (v <= 0) return null;
                  return (
                    <rect
                      key={s.key}
                      x={cx(i) - bw / 2}
                      // 2px surface gap between stacked segments
                      y={yTop + (si === 0 ? 0 : 1)}
                      width={bw}
                      height={Math.max(1, h - (si === 0 ? 0 : 2))}
                      rx={isTop ? 4 : 0}
                      fill={SERIES[s.key].color}
                      opacity={hover && !(hover.c === i && hover.s === si) ? 0.45 : 1}
                      onMouseEnter={() => setHover({ c: i, s: si })}
                      onMouseLeave={() => setHover(null)}
                    />
                  );
                })}
                <text x={cx(i)} y={PAD_T + PH - (totals[i] / max) * PH - 8} textAnchor="middle" fontSize="11" fontWeight="600" fill={INK_SUBTLE} className="nums">
                  {totals[i]}
                </text>
                <text x={cx(i)} y={H - 8} textAnchor="middle" fontSize="11" fill={INK_SUBTLE}>{c}</text>
              </g>
            );
          })}
        </svg>

        {hover ? (
          <div className="pointer-events-none absolute top-2 right-2 rounded-[var(--radius-md)] border border-hairline bg-surface-2 px-2.5 py-1.5 text-[12px] shadow-lg">
            <div className="text-ink-subtle">{categories[hover.c]}</div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: SERIES[series[hover.s].key].color }} />
              <span className="text-ink-muted">{SERIES[series[hover.s].key].label}</span>
              <span className="nums font-medium text-ink">{series[hover.s].values[hover.c]}</span>
            </div>
          </div>
        ) : null}
      </div>
    </figure>
  );
}
