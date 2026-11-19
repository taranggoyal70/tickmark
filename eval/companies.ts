/**
 * The companies the eval closes.
 *
 * `dev` is the bundled sample company, Northwind Robotics. Tickmark was built
 * and tuned against it, so its numbers are reported but never used as the
 * headline.
 *
 * The held-out companies come from the same generator with a different seed.
 * The seed re-draws every amount, invoice count, date and bank narrative, and
 * it also re-draws each vendor's coding policy: which GL account it hits and
 * how it splits across departments. A rule that only worked because it had
 * memorised Northwind's chart would fail here. Their seeds were fixed before
 * any of them was run, and nothing in the agent was changed after seeing them.
 */
import { DEPARTMENTS, VENDORS, type VendorSpec } from "../src/lib/seed/fixture";
import { generateAll, type GenerateOptions } from "../src/lib/seed/generate";
import type { Company } from "../src/lib/agent/simulate";

/** Six month-end closes, January through June. */
export const EVAL_PERIODS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"] as const;

/**
 * Fixed before the first run. Changing these is changing the test set.
 *
 * Round 1 (101, 202, 303) was run once, in commit 49b0322, and exposed a
 * defect: the same-day settlement strategy swept unrelated same-day fees into
 * a payroll match. That fix was made after seeing those results, so round 1
 * is no longer clean evidence for it. Round 2 (404, 505, 606) was chosen after
 * the fix and before anything was run on it, and is the headline.
 */
export const HELD_OUT_ROUND_1 = [101, 202, 303] as const;
export const HELD_OUT_ROUND_2 = [404, 505, 606] as const;
export const HELD_OUT_SEEDS = [...HELD_OUT_ROUND_1, ...HELD_OUT_ROUND_2] as const;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Accounts a vendor of each kind could plausibly be coded to. Vendors whose
 * account is structural (payroll, the processor's fees, an annual prepaid)
 * keep it, because the generator's ledger relies on it.
 */
const PLAUSIBLE: Record<string, string[]> = {
  "6820": ["6820", "6830"],
  "6830": ["6830", "6820"],
  "6510": ["6510"],
  "6610": ["6610"],
  "5010": ["5010", "1500"],
  "5020": ["5020", "5010"],
  "6910": ["6910"],
  "6710": ["6710"],
};
const STRUCTURAL = new Set(["Stripe", "Gusto", "Salesforce", "Deel"]);

/** One to three departments, weights in whole 5% steps that sum to 100%. */
function drawSplit(r: () => number): Record<string, number> {
  const codes = DEPARTMENTS.map((d) => d.code);
  const n = 1 + Math.floor(r() * 3);
  const picked: string[] = [];
  while (picked.length < n) {
    const c = codes[Math.floor(r() * codes.length)];
    if (!picked.includes(c)) picked.push(c);
  }
  let left = 20; // twenty 5% steps
  const out: Record<string, number> = {};
  picked.forEach((c, i) => {
    const steps = i === picked.length - 1 ? left : 1 + Math.floor(r() * (left - (picked.length - 1 - i)));
    left -= steps;
    out[c] = steps / 20;
  });
  return out;
}

export function redrawPolicies(seed: number): VendorSpec[] {
  const r = rng(seed * 7919);
  return VENDORS.map((v) => {
    if (STRUCTURAL.has(v.name)) return v;
    const choices = PLAUSIBLE[v.glCode] ?? [v.glCode];
    return { ...v, glCode: choices[Math.floor(r() * choices.length)], deptSplit: drawSplit(r) };
  });
}

export interface EvalCompany extends Company {
  id: string;
  split: "dev" | "held-out";
  /** which held-out round; see HELD_OUT_SEEDS */
  round?: 1 | 2;
  seed: number;
  /** what changes mid-run, if anything */
  drift?: GenerateOptions["drift"];
}

export function devCompany(): EvalCompany {
  return {
    id: "northwind", split: "dev", seed: 0, name: "Northwind Robotics (bundled sample)",
    vendors: VENDORS, periods: generateAll({ periods: EVAL_PERIODS }),
  };
}

export function heldOutCompany(seed: number): EvalCompany {
  const vendors = redrawPolicies(seed);
  return {
    id: `heldout-${seed}`, split: "held-out", seed, name: `Held-out company, seed ${seed}`,
    round: (HELD_OUT_ROUND_1 as readonly number[]).includes(seed) ? 1 : 2,
    vendors, periods: generateAll({ seed, vendors, periods: EVAL_PERIODS }),
  };
}

/**
 * The policy-change scenario. From the fourth close (April) on, one held-out
 * company starts charging Digi-Key components to Engineering prototypes. Any
 * rule learned for Digi-Key before April is now wrong.
 */
export const DRIFT = {
  seed: HELD_OUT_SEEDS[0],
  vendor: "Digi-Key Electronics",
  fromIndex: 3,
  glCode: "5010",
  deptSplit: { ENG: 1 },
} as const;

export function driftCompany(): EvalCompany {
  const { seed, ...drift } = DRIFT;
  const vendors = redrawPolicies(seed);
  return {
    id: `drift-${seed}`, split: "held-out", round: 1, seed, name: `Held-out company ${seed}, policy change in April`,
    vendors, drift: { ...drift, deptSplit: { ...drift.deptSplit } },
    periods: generateAll({ seed, vendors, periods: EVAL_PERIODS, drift: { ...drift, deptSplit: { ...drift.deptSplit } } }),
  };
}
