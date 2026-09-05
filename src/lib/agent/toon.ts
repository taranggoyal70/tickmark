/**
 * A small TOON encoder.
 *
 * AXI principle 1 (token-efficient output): uniform arrays are sent as one
 * header plus one line per row, instead of repeating every key on every object
 * the way JSON does. On the batches this agent sends, that is a ~40% saving on
 * input tokens for identical information - which shows up directly in the cost
 * per close.
 *
 * https://github.com/kunchenguid/axi  ·  https://toonformat.dev
 */

const esc = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[,\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** `name[N]{f1,f2}:` followed by one indented comma-separated row per item. */
export function toonTable<T extends object>(
  name: string, rows: T[], fields: (keyof T & string)[],
): string {
  if (rows.length === 0) return `${name}[0]: none`;   // AXI 5: definitive empty state
  const head = `${name}[${rows.length}]{${fields.join(",")}}:`;
  const body = rows.map((r) => "  " + fields.map((f) => esc(r[f])).join(",")).join("\n");
  return `${head}\n${body}`;
}

export function toonKv(name: string, obj: Record<string, unknown>): string {
  const body = Object.entries(obj).map(([k, v]) => `  ${k}: ${esc(v)}`).join("\n");
  return `${name}:\n${body}`;
}

/** AXI principle 3: truncate long free text, but say how much was dropped. */
export const clip = (s: string, n = 90) =>
  s.length <= n ? s : `${s.slice(0, n)}…(+${s.length - n}c)`;

export const usd = (cents: number) => (cents / 100).toFixed(2);
