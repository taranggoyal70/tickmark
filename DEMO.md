# Demo script — 4 minutes

Syndicate by Maximor · Track 2, Autonomous Office of the CFO.

Record at 1440×900. Have the production site, a signed-in queue tab, a terminal,
and the AO window open before recording.

## Current release condition

The live report was recorded with `provenance: "model"`, but it is degraded:
AI Gateway rejected inference because the linked team has no valid billing card.
Across the four recorded closes, all 28 model batches failed and all four
gradient steps were skipped. Tickmark failed closed and routed undecided work to
review. Leave the provenance banner visible and describe this as fail-safe
behavior, never as model quality.

The deterministic `npm run selftest` remains useful proof that the full learning
loop is wired. Its 55% → 79% auto-clear curve and 41 → 21 exception curve are
mechanism-test results, not real-model measurements.

---

## 0:00–0:25 · The problem

**On screen:** [the production landing page](https://tickmark-kappa.vercel.app).

> "Month-end close is days of a controller repeating the same judgments: tying
> the bank to the ledger, coding invoices, and finding costs that arrived before
> their invoices. Tickmark turns reviewed corrections into deterministic rules,
> so the judgment is traceable and only has to be made once."

If the amber banner is visible, point to it immediately:

> "This report is intentionally labeled. The model provider is unavailable, so
> these figures show the system failing closed—not model quality."

## 0:25–0:55 · It takes exported books

**On screen:** `/setup`. Show the bank, ledger, invoice, and optional settlement
inputs; do not upload during the recording unless the account is already signed
in and the sample files have been preflighted.

> "The same ingestion path handles the bundled sample company and customer CSVs.
> Headers and accounting number formats are normalized, but unreadable rows are
> reported with their line number rather than silently dropped."

## 0:55–1:30 · Rules first, model residue second

**On screen:** `/close/run`.

> "Every close starts with the Rulebook. Earned rules execute deterministically
> with zero model calls. Only the residue reaches the model, and confidence plus
> materiality decide what can clear without a controller."

With the current billing limitation, a signed-in **Run both closes** action
should complete in degraded mode instead of pretending to decide:

> "The provider refused inference. Tickmark still records the close, labels the
> outage, and sends every undecided line to review. That is the safe accounting
> behavior."

## 1:30–2:20 · The human gate

**On screen:** `/close/exceptions`, already signed in and preflighted with two
same-kind exceptions for one vendor.

Resolve the first and tick **always do this**. Read the amber response:

> "Noted—but not yet a rule. One correction is an anecdote."

Resolve the second matching exception and show the proposed rule and replay.

> "Now there are two attributable corrections. The proposal cites them, replays
> against closed periods, and still cannot activate itself. A controller owns
> adoption."

If the queue is not in that exact state, show the terminal output from
`npm run verify:gate`; do not stage or relabel a mechanism result as production
model behavior.

## 2:20–2:50 · Controller-ready outputs

**On screen:** `/close/reconciliation`, `/close/entries`, then `/close/binder`.

> "Reconciliation lists every unexplained amount instead of hiding behind a
> percentage. Accrual entries must balance and require a different approver.
> The binder exports the tickmarks and their evidence for audit support."

## 2:50–3:20 · Verification evidence

**On screen:** terminal output from `npm test`, `npm run selftest`, and
`npm run verify:all`.

> "The unit command runs both verification-script tests and provider capability
> tests. The mechanism selftest passes 16 checks. Full verification passes eight
> stages, including all four live Supabase suites—none were skipped. These prove
> controls and wiring, not model quality."

## 3:20–3:45 · AO (required — do not cut)

**On screen:** the AO window with the session list visible.

> "AO shows 23 sessions total, including workers, orchestrators, and terminated
> sessions. Substantive Codex AO sessions covered audit, hardening, deployment,
> eval, and integration. Isolated worktrees let those efforts stay reviewable
> while this final session reconciled the release on main."

## 3:45–4:00 · Close

> "Tickmark: the close that gets cheaper as reviewed judgment compiles into
> rules—and that refuses to bluff when an external model is unavailable."

**On screen:** landing page with the **See the fail-safe report** CTA.

---

## Pre-flight

- [ ] `npm test` passes five tests.
- [ ] `npm run selftest` passes 16 mechanism checks.
- [ ] `npm run verify:all` ends with `everything holds`; database invariants,
      evidence gate, close loop, and import all show `PASS`, never `SKIP`.
- [ ] Production smoke test passes `/`, `/close`, `/close/run`,
      `/close/rulebook`, `/close/entries`, `/close/cash`,
      `/close/reconciliation`, `/close/binder`, and the binder API.
- [ ] Signed in only for write demonstrations; Clerk is using development keys.
- [ ] AO window shows the current total of 23 sessions.
- [ ] The degraded provenance banner is visible and the talk track names the AI
      Gateway billing limitation.

## Do not

- Do not call mock or degraded figures model quality.
- Do not hide, crop, or remove the honest degraded-provenance banner.
- Do not run `npm run publish` against the current degraded report; the safety
  gate correctly refuses it.
- Do not add billing details, change auth accounts, or submit Devpost during the
  recording workflow.
- Do not spend demo time on the sign-in flow.
