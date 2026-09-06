# Measured-evidence run — 2026-09-06

Status: **blocked before model inference; no model-quality metrics were produced or published.**

This is the evidence from an attempted real-model run. It intentionally does
not substitute the deterministic mechanism-test figures for model results.

## Reproducibility

- Run and verification completed at: `2026-09-06T19:18:32Z`
- Source commit before the safety fixes: `e3bc5de2ca5bb8196be31c8b732e0fe809cc08f3`
- Node.js: `v24.10.0`
- npm: `11.6.0`
- Lockfile SHA-256: `467eada9faba11913533cde84bbbc18ed2bf6952edf9484f22014829a0f58d6c`
- Secret source: `/Users/tarang/tickmark/.env.local` (values were not printed or copied into the repository)
- Model route: Vercel AI Gateway → `anthropic/claude-opus-5`
- Configured rate: `$5.00` input / `$25.00` output per million tokens

The OIDC token in the supplied file had expired at
`2026-09-06T07:29:59Z`. A fresh development token was pulled from the already
linked Vercel project into a temporary, ignored file; it was valid through
`2026-09-07T07:12:50Z`. The supplied secret file was not overwritten.

## Exact command outcomes

| Command | Exit | Result |
|---|---:|---|
| `npm ci` | 0 | 553 packages installed and 554 audited in 6s; npm reported 10 moderate and 4 high vulnerabilities. |
| `npm run check` | 1 | Authentication reached AI Gateway, which refused inference because the linked team has no valid payment card on file. |
| `npm run simulate` | 1 | Aborted in period `2026-01`; 0 successful LLM calls, 83 fail-closed exceptions, and `$0.0000` harness-recorded model cost. |
| `npm run selftest` | 0 | 12 checks passed, including refusal of mock, degraded, and zero-call reports by the measured-report gate. These are mechanism checks, not model metrics. |
| `npm run typecheck` | 0 | Next.js route types generated; TypeScript passed with no diagnostics. |
| `npm run lint` | 0 | ESLint passed with no findings. |
| `npm run verify:all` | 0 | Types, lint, loop wiring, and settlement suites passed. Four live-database suites were skipped because they perform test writes; Supabase connectivity was checked read-only instead. |
| `npm run publish` | 1 (expected safety refusal) | Refused the latest Supabase report because its provenance is `mock`; no queue publication was performed. |

## Provenance and metrics

No new `SimulationReport` was completed or saved. Consequently, there are no
honest measured values for coding accuracy, match accuracy, auto-clear rate,
auto-clear precision, exceptions per completed close, rule adoption, or
controller touch time.

The partial run's `83` exceptions and `0%` cleared line describe the system's
fail-closed response to an unavailable model. They are **not** model-quality
measurements and must not be presented as such.

Exact locally recorded model cost for the attempted run was `$0.0000`: the
harness received no successful generation usage to price. No provider billing
export was available, so this report makes no separate claim about an external
invoice.

## Supabase decision

A read-only query confirmed that Supabase is reachable. Its latest report was
generated at `2026-09-06T17:26:01.69Z`, has four periods, and carries
`provenance: "mock"`. Publishing that report would be unsafe and misleading,
so no measured report or exception queue was published.

## Safety fixes made from this run

- The measured-simulation CLI now requires `provenance: "model"`, explicit
  zero-failure accounting, and at least one successful model call before save.
- Queue publication applies the same gate, preventing an older mock or degraded
  report from being materialised after a failed measurement attempt.
- The mechanism test covers rejection of mock, degraded, and zero-call reports.
- Clean-install typechecking now runs `next typegen` before `tsc --noEmit`, as
  required for the Next.js 16 generated `PageProps` and `LayoutProps` globals.

## Unblock condition

Add a valid payment card to the linked Vercel team's AI Gateway account (or add
another supported real-model credential to the supplied environment), refresh
the local OIDC token, then rerun `npm run check` and `npm run simulate`. Only a
successful report that passes the measured-report gate may be published.
