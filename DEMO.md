# Demo script — 4 minutes

Syndicate by Maximor · Track 2, Autonomous Office of the CFO.

Record at 1440×900. Have the production site, a signed-in queue tab, a terminal,
and the AO window open before recording.

## Current release condition

The live report is a completed real-model run through local `llama3.2:1b`: 30
successful calls, zero failed batches, zero skipped gradient steps, and five
active rules. Auto-clear moves 0% → 39%, controller time 63 → 47 minutes, and
unattended precision holds at 100%. The local endpoint had no configured token
price, so `$0.0000` is an honest unpriced result; emphasize the measured call
reduction from 7 → 6 instead of claiming a dollar saving.

The small model scored poorly at raw matching. That is part of the proof:
Tickmark never lets fresh model confidence authorize a ledger assertion. Model
suggestions go to the controller; only rules compiled from reviewed corrections
and a passing backtest clear work unattended.

---

## 0:00–0:25 · The problem

**On screen:** [the production landing page](https://tickmark-kappa.vercel.app).

> "Month-end close is days of a controller repeating the same judgments: tying
> the bank to the ledger, coding invoices, and finding costs that arrived before
> their invoices. Tickmark turns reviewed corrections into deterministic rules,
> so the judgment is traceable and only has to be made once."

Point to the measured figures:

> "This is a real local-model run, not the deterministic selftest: 30 successful
> calls, no failed batches, and 100% precision on unattended work."

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
> with zero model calls. Only the residue reaches the model, and every fresh
> model suggestion stays review-only. Confidence never grants its own authority."

Show the period table: model calls fall from 7 to 6 and controller time from 63
to 47 minutes after five backtested rules activate, while precision stays 100%.

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

> "The unit command runs eight compiler, verification, and provider tests. The
> mechanism selftest passes 21 checks. Full verification passes eight
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

**On screen:** landing page with the **See the measured results** CTA.

---

## Pre-flight

- [ ] `npm test` passes eight tests.
- [ ] `npm run selftest` passes 21 mechanism checks.
- [ ] `npm run verify:all` ends with `everything holds`; database invariants,
      evidence gate, close loop, and import all show `PASS`, never `SKIP`.
- [ ] Production smoke test passes `/`, `/close`, `/close/run`,
      `/close/rulebook`, `/close/entries`, `/close/cash`,
      `/close/reconciliation`, `/close/binder`, and the binder API.
- [ ] Signed in only for write demonstrations; Clerk is using development keys.
- [ ] AO window shows the current total of 23 sessions.
- [ ] The live report shows `llama3.2:1b`, five active rules, no model failures,
      and 100% unattended precision.

## Do not

- Do not call the selftest figures real-model quality.
- Do not claim model matching quality; the measured model scored 0% there.
- Do not invent a dollar saving for the unpriced local endpoint; show calls and
  controller minutes instead.
- Do not add billing details, change auth accounts, or submit Devpost during the
  recording workflow.
- Do not spend demo time on the sign-in flow.
