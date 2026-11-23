import { ImageResponse } from "next/og";
import { offlineHeldOut } from "@/lib/results";

/**
 * The card a shared link unfurls into: the landing page's hero, drawn from the
 * same committed eval results as Fig. 1, so the card and the page never
 * disagree. Rendered once at build time. Set in Geist Regular, the face
 * bundled with next/og, so no font is fetched.
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const { companies, closes } = offlineHeldOut();
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const two = (n: number) => String(n).padStart(2, "0");
/** Truncated like the page: a share never rounds itself up. */
const share = (n: number, d: number) => (d ? Math.floor((100 * n) / d) : 0);
const first = closes[0];
const last = closes[closes.length - 1];

export const alt =
  `Tickmark: models guess, rules don't. Across six month-end closes on ${companies} companies the rules were never tuned on, ` +
  `the share of decisions settled by a rule rises from ${share(first?.byRule ?? 0, first?.decisions ?? 0)}% to ` +
  `${share(last?.byRule ?? 0, last?.decisions ?? 0)}%.`;

const PAPER = "#f3f2ee";
const INK = "#161513";
const MUTED = "#706d66";
const MODEL = "#8e897f";
const SIGNAL = "#e2501d";
const LINE = "rgba(22, 21, 19, 0.1)";

const STRIP_W = 800;
const STRIP_H = 16;

/** One close as one mark per decision, ink for a rule, signal for the controller. */
function Strip({ rule, model, exception }: { rule: number; model: number; exception: number }) {
  const kinds = [...Array(rule).fill(INK), ...Array(model).fill(MODEL), ...Array(exception).fill(SIGNAL)] as string[];
  const n = Math.max(kinds.length, 1);
  const w = (STRIP_W - (n - 1)) / n;
  return (
    <svg width={STRIP_W} height={STRIP_H} viewBox={`0 0 ${STRIP_W} ${STRIP_H}`}>
      {kinds.map((fill, i) => <rect key={i} x={i * (w + 1)} y={0} width={w} height={STRIP_H} fill={fill} />)}
    </svg>
  );
}

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: PAPER, color: INK }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "52px 64px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <svg width="26" height="26" viewBox="0 0 20 20">
              <path d="M3 10.5 L7.5 15.5 L17 4.5" fill="none" stroke={SIGNAL} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: 30, letterSpacing: "-0.6px" }}>Tickmark</span>
          </div>
          <span style={{ fontSize: 20, color: MUTED, letterSpacing: "0.2px" }}>The month-end close that learns</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", padding: "34px 64px 0", fontSize: 98, lineHeight: 0.95, letterSpacing: "-5.4px" }}>
          <span style={{ color: MODEL }}>Models guess.</span>
          <span>Rules don&rsquo;t.</span>
        </div>

        <div
          style={{
            display: "flex", flexDirection: "column", gap: 9, marginTop: "auto", padding: "26px 64px 24px",
            borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`,
            backgroundImage: "radial-gradient(circle, rgba(22, 21, 19, 0.16) 1px, transparent 1px)",
            backgroundSize: "16px 16px",
          }}
        >
          {closes.map((c) => {
            const rule = c.byRule;
            const model = Math.max(0, c.cleared - c.byRule);
            const exception = Math.max(0, c.decisions - rule - model);
            return (
              <div key={c.close} style={{ display: "flex", alignItems: "center", gap: 22 }}>
                <span style={{ display: "flex", width: 90, fontSize: 17, color: MUTED }}>
                  <span style={{ color: INK }}>{two(c.close)}</span>&nbsp;· {MONTHS[Number(c.period.slice(5, 7)) - 1]}
                </span>
                <Strip rule={rule} model={model} exception={exception} />
                <span style={{ display: "flex", fontSize: 17, color: MUTED }}>
                  <span style={{ color: INK }}>{share(rule, c.decisions)}%</span>&nbsp;by rule
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 64px 34px", fontSize: 16, color: MUTED }}>
          <span style={{ display: "flex" }}>
            <span style={{ color: INK }}>Fig. 1</span>&nbsp;&nbsp;Six closes on {companies} companies the rules were never tuned on
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 11, height: 11, background: INK }} />settled by a rule</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 11, height: 11, background: SIGNAL }} />sent to the controller</span>
          </span>
        </div>
      </div>
    ),
    size,
  );
}
