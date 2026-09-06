# Demo script — 3 minutes

Syndicate by Maximor · Track 2, Autonomous Office of the CFO.

Three minutes is short. This is cut so the **single strongest moment** — the
system refusing to learn from one example — lands at 1:10, while attention is
still high. Everything else supports it.

Record at 1440×900. Have `npm run dev`, a signed-in browser, and the AO window
open **before** you hit record.

---

## 0:00–0:20 · The problem, stated like an accountant would

> "Month-end close is five to ten days of a controller doing the same three
> things they did last month: tying the bank statement to the ledger, coding
> vendor invoices, and hunting for costs that were incurred but never invoiced.
> The judgment is real. It's also identical every month — and it lives in one
> person's head."

**On screen:** the landing page. Don't scroll. Let the headline sit.

---

## 0:20–0:40 · What it does

> "Tickmark runs that close. It codes the AP ledger, reconciles the bank across
> all four match shapes, and finds the accruals nobody invoiced. What it can't
> assert, it hands to a controller — and that queue is the product."

**On screen:** `/close/exceptions`. Scroll once, slowly. Land on an item with a
visible confidence and a vendor.

---

## 0:40–1:25 · The moment — make this beat count

Resolve one exception. Tick **"always do this"**.

> "Here's where most agent demos cheat. I've told it to always do this."

**On screen:** the amber panel appears. **Read it aloud, verbatim:**

> *"Noted — but not yet a rule. One correction is an anecdote. I'll propose a
> rule the next time a correction agrees with it."*

> "It refused. One correction is an anecdote, and a rule that posts real
> accounting entries needs evidence. That's not a prompt asking nicely — it's a
> database constraint."

Now resolve a **second** exception for the same vendor, same kind. Tick it again.

**On screen:** the rule proposal, with its backtest.

> "Second correction. Now it proposes the rule — citing both corrections
> verbatim, already replayed against every closed period. Fired eleven times,
> a hundred percent precision. I adopt it, and my name goes on it forever."

---

## 1:25–2:00 · Why it gets cheaper

**On screen:** `/close` dashboard.

> "Four closes, same model throughout. Auto-clear goes 55 to 79 percent.
> Exceptions halve. Cost per close falls — not because the model got cheaper,
> but because every rule it learned executes with zero model calls. Most agents
> learn by growing a prompt, so every lesson costs more forever. This one
> compiles the judgment into something free to run."

Point at the precision chart.

> "And this is the line that must not move. Nobody reviews what it cleared
> unattended — so a system that gets faster by getting sloppier is worse than
> no system."

---

## 2:00–2:30 · Why an accountant would sign it

**On screen:** terminal. Run `npm run verify:gate` live.

> "These aren't claims in a README. Debits must equal credits, tickmarks are
> append-only, preparer can't equal approver, no rule activates without an
> approver's name, and a rule that failed its replay can't be adopted at all —
> every one enforced in the database and tested against the live instance."

Let the PASS lines scroll. Don't narrate them.

---

## 2:30–2:50 · AO  *(required — do not cut this)*

**On screen:** the AO window, sessions visible.

> "Built with AO. I registered the repo as a project and ran the build as
> orchestrated Claude Code sessions in isolated worktrees — [N] of them —
> covering the schema, the exception queue, and the tracing work."

State the real number. Show the session list.

---

## 2:50–3:00 · Close

> "Tickmark. The close that gets cheaper every month, because the judgment only
> has to be made once."

**On screen:** landing page.

---

## Pre-flight

- [ ] `npm run simulate` has run — the dashboard shows **measured** numbers, and the
      provenance banner is **gone**. Do not record with the mock banner showing.
- [ ] `npm run publish` — queue is populated
- [ ] Two open exceptions share a vendor **and** kind (needed for the 0:40 beat).
      `npm run verify:gate` prints which scope qualifies, then restores the queue.
- [ ] Signed in, so `/close` doesn't bounce to sign-in mid-take
- [ ] AO window open with sessions visible

## Do not

- Show the sign-in flow. The organisers said explicitly not to spend time on auth.
- Read the architecture aloud. Show it working.
- Leave the mechanism-test banner on screen. Either run a measured pass or say
  plainly it's a stand-in — never let it read as model performance.
