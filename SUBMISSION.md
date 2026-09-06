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
residue, but a fresh model suggestion always enters the controller queue rather
than authorizing itself. Only a human-earned, backtested rule can issue an
append-only tickmark, and materiality still limits that authority. A first
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
- Structured corrections compile directly when they agree; policy creation does
  not depend on a model faithfully reproducing facts already captured by a human.
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
| `npm test` | Exit 0; 8/8 tests passed, including deterministic correction compilation, conflicting-evidence refusal, verification-script behavior, and provider capability tests. |
| `npm run typecheck` | Exit 0; Next.js route types generated and TypeScript completed without diagnostics. |
| `npm run lint` | Exit 0; ESLint completed without findings. |
| `npm run build` | Exit 0; Next.js 16.3.4 production build compiled all application routes. |
| `npm run selftest` | Exit 0; 21/21 mechanism checks passed, including fail-closed provider behavior, measured-report gates, and semantic-rule deduplication. |
| `npm run verify:all` | Exit 0; all 8 stages passed. The four live Supabase stages—database invariants, evidence gate, close loop, and import—ran and passed; none were skipped. |
| `npm run check` | Exit 0 against local `llama3.2:1b`; the OpenAI-compatible endpoint returned `OK`. |

The selftest uses a deterministic stand-in to prove control flow and invariants.
Its percentages, exception counts, and synthetic costs are not model-quality
measurements.

## Measured real-model result

The published four-period run used local `llama3.2:1b` through the product's
OpenAI-compatible endpoint. It completed 30 successful calls with zero failed
batches and zero skipped gradients. Five rules passed the evidence and replay
gates. From the first to fourth close, auto-clear moved 0% → 39%, close-model
calls 7 → 6, controller time 63 → 47 minutes, and unattended precision remained
100%. The local endpoint had no configured per-token price, so the report shows
`$0.0000` rather than inventing a cost claim.

## Honest external limitations

- The small local model scored 0% on raw matching. Fresh model suggestions are
  review-only, so this did not reduce unattended precision; the measured gain
  came from controller-earned rules.
- Vercel AI Gateway still refuses hosted inference until the linked team has a
  valid payment card. The production report is the completed local-model run
  persisted in Supabase, not a claim that hosted inference is configured.
- Clerk is configured with development keys, appropriate for judging but not a
  production customer rollout. No auth-account changes were made.
- The repository's dependency audit reports 10 moderate and 4 high findings;
  these remain a disclosed follow-up rather than an unreviewed forced upgrade.

## 3–5 minute demo beats

1. **0:00–0:25 — Problem and promise.** Open the landing page and name the
   repetitive close judgments Tickmark targets. Identify the real-model report.
2. **0:25–0:55 — Bring exported books.** Show `/setup` and the strict-but-helpful
   CSV ingestion contract.
3. **0:55–1:30 — Close architecture.** Show `/close/run`: Rulebook first, model
   residue second, fresh model suggestions to review, and only replayed rules
   clearing unattended within materiality.
4. **1:30–2:20 — Human gate.** In `/close/exceptions`, show first correction →
   standing intent, second compatible correction → backtested proposal, and
   separate controller adoption. Use `npm run verify:gate` output if the live
   queue is not preflighted.
5. **2:20–2:50 — Finance outputs.** Show reconciliation details, balanced draft
   entries, and the downloadable binder.
6. **2:50–3:20 — Evidence.** Show eight unit tests, 21 selftest checks, and all
   eight verification stages passing, including four live database stages.
7. **3:20–3:45 — AO use.** Show the 23-session AO list and briefly describe the
   substantive Codex work on audit, hardening, deployment, eval, and integration.
8. **3:45–4:00 — Close.** Return to the measured results; end on compiled
   judgment plus refusal to let raw model confidence authorize the books.

## Suggested closing line

Tickmark makes the close cheaper as reviewed judgment compiles into rules—and
keeps the accounting honest when an external model cannot answer.
