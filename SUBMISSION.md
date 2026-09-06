# Tickmark — Devpost submission copy

## Project links

- Live application: https://tickmark-kappa.vercel.app
- Source repository: https://github.com/taranggoyal70/tickmark
- Track: Syndicate by Maximor — Track 2, Autonomous Office of the CFO

## Tagline

The month-end close that gets cheaper every month because reviewed accounting
judgment compiles into deterministic, auditable rules.

## Inspiration and problem

Month-end close repeatedly asks controllers to make the same high-context
decisions: reconcile statement lines to the ledger, code AP invoices, and find
costs incurred before an invoice arrives. Existing agents tend to accumulate
prompt context, making every future run longer and harder to audit. Tickmark
instead treats a correction as evidence that can eventually earn a rule.

## What it does

Tickmark ingests exported bank, ledger, invoice, and payment-settlement CSVs and
runs three close workflows end to end:

- bank reconciliation across one-to-one, one-to-many, many-to-one, and
  many-to-many matches, with named residuals;
- AP coding with GL, department, and class decisions;
- accrual completeness with balanced draft journal entries.

The active Rulebook runs first with no model call. A model handles only the
residue. Confidence and materiality gates decide which items can receive an
append-only tickmark and which must enter the controller queue. A first
"always do this" correction records standing intent but cannot create a rule.
A second compatible correction may produce a proposal, which is backtested
against closed periods and still requires human adoption.

## Why it fits the track

Tickmark automates the repetitive core of the Office of the CFO while preserving
the controls a finance team needs: traceability, segregation of duties,
materiality, balanced entries, attributable adoption, and an audit-support
binder. Its central technical idea is that learning reduces future inference:
accepted judgment becomes inspectable executable policy instead of more prompt
tokens.

## Technical implementation

The product is a Next.js 16 App Router application deployed on Vercel. AI SDK
routes model work through Vercel AI Gateway by default and also supports an
explicitly configured OpenAI-compatible endpoint; JSON Schema structured output
is opt-in for endpoints that truthfully support it. Supabase Postgres is the
system of record for books, close runs, tickmarks, corrections, rules, and
database-enforced controls. Clerk provides authentication for write paths while
the synthetic read-only close views and binder remain public.

The close engine is split into deterministic rules, model-backed residue,
hard gates, persistence, controller corrections, gradient proposals, and
historical backtests. The downloadable binder exposes audit evidence as JSON or
CSV rather than leaving support trapped in dashboard counters.

## What is technically distinctive

- Learning compiles into deterministic rules that cost zero tokens to execute.
- Analysis cannot activate its own proposal; adoption is a separate human act.
- Rules require at least two same-kind corrections and a passing replay.
- Tickmarks are append-only and every automated decision has an evidence chain.
- Provider outages fail closed: undecided work is labeled and routed to review
  while the close remains inspectable.
- Semantically identical learned rules cannot become a second active rule;
  duplicate proposals retain their evidence and link to the canonical rule.
- OpenAI-compatible structured output is an explicit capability flag, avoiding
  false assumptions about self-hosted or third-party gateways.

## Built with AO

At final integration, `ao session ls --project tickmark --all
--include-terminated` showed 23 total sessions across workers, orchestrators, and
terminated runs. Substantive Codex AO sessions covered audit, hardening,
deployment, eval, and integration. AO's isolated worktrees made those efforts
independently inspectable; the final release session reconciled the selected
commit into the current main line and reran the complete verification story.
The count is a point-in-time session total, not a claim that all 23 sessions
produced distinct features.

## Challenges and decisions

Accounting safety made several seemingly convenient shortcuts unacceptable.
Unreadable rows are rejected instead of guessed. High-confidence work still
cannot bypass materiality. A controller request does not become policy after one
example. Reports from a deterministic stand-in or an unavailable provider are
labeled and blocked from the measured-results publication path.

Migration `0005` was applied through the Supabase web SQL editor. It backfilled
canonical semantic signatures, retained nine historical duplicate proposals,
and enforced a partial unique index so each entity can have only one active
rule for the same behavior. A post-migration query verified the columns,
trigger, and index, with zero null signatures and zero active duplicate groups.

## Verification performed for this release

| Command | Verified result |
|---|---|
| `npm ci` | Exit 0; 553 packages installed, 554 audited. npm reported 10 moderate and 4 high dependency findings. |
| `npm test` | Exit 0; 5/5 tests passed: both `scripts/*.test.ts` coverage and the OpenAI-compatible provider capability tests. |
| `npm run typecheck` | Exit 0; Next.js route types generated and TypeScript completed without diagnostics. |
| `npm run lint` | Exit 0; ESLint completed without findings. |
| `npm run build` | Exit 0; Next.js 16.3.4 production build compiled all application routes. |
| `npm run selftest` | Exit 0; 21/21 mechanism checks passed, including fail-closed provider behavior, measured-report gates, and semantic-rule deduplication. |
| `npm run verify:all` | Exit 0; all 8 stages passed. The four live Supabase stages—database invariants, evidence gate, close loop, and import—ran and passed; none were skipped. |
| `npm run check` | Exit 1; authentication reached AI Gateway, which refused inference because the linked team has no valid payment card. |

The selftest uses a deterministic stand-in to prove control flow and invariants.
Its percentages, exception counts, and synthetic costs are not model-quality
measurements.

## Honest external limitations

- Vercel AI Gateway currently refuses inference until the linked team has a
  valid payment card. No billing change was made for this submission.
- The hosted run was rejected before inference. A local `llama3.2` run first
  returned schema-invalid output; after structured mode was enabled, a second
  run timed out after 15 minutes without completing its first period. Neither
  produced model-quality metrics, and the safety gate published neither as
  measured evidence.
- The live database's latest report has model provenance but is degraded: 28
  failed model batches and four skipped gradient steps across four closes. It
  demonstrates fail-safe behavior only, not model quality.
- Clerk is configured with development keys, appropriate for judging but not a
  production customer rollout. No auth-account changes were made.
- The repository's dependency audit reports 10 moderate and 4 high findings;
  these remain a disclosed follow-up rather than an unreviewed forced upgrade.

## 3–5 minute demo beats

1. **0:00–0:25 — Problem and promise.** Open the landing page and name the
   repetitive close judgments Tickmark targets. Point out the degraded-report
   banner before discussing any figures.
2. **0:25–0:55 — Bring exported books.** Show `/setup` and the strict-but-helpful
   CSV ingestion contract.
3. **0:55–1:30 — Close architecture.** Show `/close/run`: Rulebook first, model
   residue second, confidence plus materiality, then fail-closed review when the
   provider is unavailable.
4. **1:30–2:20 — Human gate.** In `/close/exceptions`, show first correction →
   standing intent, second compatible correction → backtested proposal, and
   separate controller adoption. Use `npm run verify:gate` output if the live
   queue is not preflighted.
5. **2:20–2:50 — Finance outputs.** Show reconciliation details, balanced draft
   entries, and the downloadable binder.
6. **2:50–3:20 — Evidence.** Show five unit tests, 21 selftest checks, and all
   eight verification stages passing, including four live database stages.
7. **3:20–3:45 — AO use.** Show the 23-session AO list and briefly describe the
   substantive Codex work on audit, hardening, deployment, eval, and integration.
8. **3:45–4:00 — Close.** Return to the landing page and the fail-safe-report
   CTA; end on compiled judgment plus refusal to bluff during outages.

## Suggested closing line

Tickmark makes the close cheaper as reviewed judgment compiles into rules—and
keeps the accounting honest when an external model cannot answer.
