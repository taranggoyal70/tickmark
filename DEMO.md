# Demo script — 3 minutes

Syndicate by Maximor · Track 2, Autonomous Office of the CFO.

Three minutes is short. This is cut to open with the **close room** — the one
thing that makes the argument visceral rather than intellectual — and to land
the **refusal to learn from one example** at 1:10, while attention is still
high. Everything else supports those two beats.

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

## 0:20–0:50 · The hook — run both closes

**On screen:** `/close/run`. Press **Run both closes** and stop talking for three
seconds. Let them watch.

> "Same company, same books, same model. On the left, January — the agent has
> learned nothing. On the right, April, after three months of a controller
> correcting it."

Point at the counters as they move.

> "Blue rows are decisions settled by a rule it learned. They cost nothing and
> take no time. Watch the right-hand queue —"

Let it finish.

> "— it hands back half as many items, for less money, on the same model."

---

## 0:50–1:35 · The moment — make this beat count

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

## 1:35–2:05 · The measured curve

**On screen:** `/close` dashboard.

**Say the numbers from your own measured run — do not read these.**

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

## 2:05–2:30 · Why an accountant would sign it

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
- [ ] Signed in **only** for the queue beat — the close room, dashboard and
      rulebook are public, so nothing else bounces mid-take
- [ ] Run the close room once before recording so it's warm
- [ ] AO window open with sessions visible

## Do not

- Show the sign-in flow. The organisers said explicitly not to spend time on auth.
- Read the architecture aloud. Show it working.
- Leave the mechanism-test banner on screen. Either run a measured pass or say
  plainly it's a stand-in — never let it read as model performance.
