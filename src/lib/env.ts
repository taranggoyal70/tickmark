/**
 * Read a numeric setting from the environment.
 *
 * A typo in a price or a timeout must fail loudly at the point of use. Silently
 * turning "0.8O" into NaN would report a NaN cost per close, and a NaN timeout
 * would disable the bound it was meant to enforce.
 */
export function envNumber(name: string, fallback: number, opts: { min?: number; integer?: boolean } = {}): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw.trim());
  const min = opts.min ?? 0;
  if (!Number.isFinite(value) || value < min || (opts.integer && !Number.isInteger(value))) {
    throw new Error(`${name} must be ${opts.integer ? "an integer" : "a number"} >= ${min}, got "${raw}"`);
  }
  return value;
}
