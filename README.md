<h1 align="center">Tickmark</h1>
<p align="center"><b>The month-end close that gets cheaper every month.</b></p>
<p align="center">
An agent that codes the AP ledger and reconciles the bank, hands a controller only what
genuinely needs judgment, and compiles every correction they make into a deterministic
rule — so the judgment gets made once, and then runs for free.
</p>

<p align="center">
<b>Syndicate by Maximor</b> · <b>Track 2 — Autonomous Office of the CFO</b><br>
Live: <a href="https://tickmark-kappa.vercel.app">tickmark-kappa.vercel.app</a>
</p>

---

> A **tickmark** is the small symbol an accountant puts beside a ledger line to say
> *"I checked this, and here is how."* Auditors have used them for a century. This
> product issues tickmarks — and earns the right to issue them without asking.

## What it takes over

The track lists six workflows. This does all six, on ingested books:

| Workflow | Where |
|---|---|
| Closing the books | `npm run close` · the dashboard's **Close the books** |
| Reconciling accounts | `/close/reconciliation` |
| Processing invoices | AP coding in the close, exceptions in `/close/exceptions` |
| Gathering audit support | `/close/binder` + JSON / CSV download |
| Preparing cash reports | `/close/cash` |
| Updating forecasts | `/close/cash` — next period, every line with its basis |

## The problem

Month-end close is 5–10 days of a controller doing the same three things they did last
month: tying the bank statement to the general ledger, deciding which GL account and
department each vendor invoice hits, and hunting for costs that were incurred but never
invoiced. The judgment involved is real, but it is also *repetitive* — the same vendor,
the same split, the same weird settlement pattern, every single month.

Rules engines in NetSuite and QuickBooks are too brittle to capture it. So the knowledge
stays in one person's head, and the close costs the same every month forever.

## What makes this different

Most agents "learn" by growing a prompt. Every lesson makes the next call longer, slower,
and more expensive — and none of it can be audited.

**Tickmark compiles learning into deterministic rules instead.** A correction becomes a
predicate and an action: versioned, human-readable, and executable with **zero model
calls**. The month the agent learns that AWS codes to `6820` split 60/25/15 across
Engineering, Data and Product, that decision stops costing anything — permanently.

The cost curve bends the right way. More learning means *fewer* calls, not bigger ones.

```
Rulebook (the weights)
  → Close Run                     (forward pass)
  → Corrections in the queue      (loss signal)
  → distil + aggregate            (gradient)
  → proposed Rule diffs, backtested
  → controller accepts / rejects  (the human gate)
  → back to the Rulebook
```

Two constraints are borrowed, with credit, from
[backpass](https://github.com/kunchenguid/backpass). In accounting they are not
niceties:

| backpass constraint | what it means on the books |
|---|---|
| **Evidence-gated** — ≥ 2 distinct corrections, quoted verbatim, and of the same kind as the rule | An auditor can trace any automated decision to the human judgment that authorised it |
| **Analysis never writes** — proposing ≠ applying | Segregation of duties, for free |

The agent's tool surface follows the ten [AXI](https://github.com/kunchenguid/axi)
principles — TOON-encoded context, minimal schemas, precomputed aggregates, definitive
empty states — which is worth roughly 40% of the input tokens on every batch.

## The three workflows

| | What it handles |
|---|---|
| **Bank reconciliation** | All four cardinalities — one payment, an ACH batch against six invoices, an invoice settled in two tranches, a lockbox deposit. Names every residual as `fx`, `bank_fee`, `partial` or `timing`, or refuses the match. |
| **AP invoice coding** | GL account, department and class per invoice — including split allocations that are pure tribal knowledge. |
| **Accrual completeness** | Finds the recurring cost incurred but not invoiced before cut-off, sizes it off trailing actuals, books it as a balanced entry with distinct preparer and approver. |

## Guardrails

These are enforced in the schema, not in a prompt — and `npm run verify:db` proves it by
deliberately violating each one and requiring the database to reject it:

1. **Debits equal credits** — checked arithmetically by a database trigger, never taken from model output.
2. **Tickmarks are append-only** — a trigger rejects every `UPDATE` and `DELETE`. You supersede a tickmark; you never edit one.
3. **Materiality is a hard gate** — nothing above the threshold auto-posts, whatever the confidence. A *backtested rule* is trusted to a higher ceiling than a fresh model judgment, because the replay and its evidence are the control; above that ceiling nobody is exempt.
4. **Preparer ≠ approver** — a constraint, not a convention.
5. **No rule activates without a backtest** and evidence from ≥ 2 corrections — also a trigger.
6. **Every decision traces** to a Rule (with its corrections) or a Close Run (with its evidence chain).

```
PASS  unbalanced journal entry is refused            debits 100 <> credits 0
PASS  preparer == approver is refused                segregation of duties
PASS  updating a tickmark is refused                 tickmarks are append-only
PASS  deleting a tickmark is refused                 tickmarks are append-only
PASS  activating an unbacktested rule is refused     invariant 6
PASS  activating a rule with 1 correction is refused evidence gate
```

## Measured, not asserted

The fixture entity generates four periods of deliberately messy data — bank aliases that
never match the legal name, Stripe deposits arriving net of fees, EUR contractor invoices
settling at a different rate than they accrued, freight invoices paid in two tranches,
and one recurring vendor that goes silent in the final period so accrual completeness has
something real to catch.

Each period carries **ground truth the agent never sees**, so accuracy is measured rather
than claimed:

```bash
npm run simulate     # measured: real model, real numbers
npm run selftest     # mechanism test: deterministic stand-in, no credential needed
```

`selftest` substitutes a stand-in for the model so the whole loop — close run →
gate → queue → corrections → gradient → backtest → rulebook → cheaper next close
— can be exercised with no API key. It proves the machinery is wired; it says
nothing about model quality. Reports carry a `provenance` field and the UI
labels mock runs prominently so the two can never be confused.

```
period   cleared  coding  match   exc  llm  rules  cost      touch
2026-01      …       …       …      …    …      …      …        …
```

The headline metrics are auto-clear rate (up), cost per close (down), controller time
(down) — and **auto-clear precision**, which must *not* move. Nobody reviews what the
agent cleared unattended, so that number is the one that matters.

## What improved across iterations

The agent runs the same close four times. Nothing about the model changes between runs —
only the Rulebook it has earned. Measured against ground truth it never sees:

| | first close | fourth close |
|---|---|---|
| Auto-cleared without a human | — | — |
| Exceptions reaching the controller | — | — |
| Cost per close | — | — |
| Controller time in the queue | — | — |
| **Auto-clear precision** | — | — |

> Numbers are filled in from `npm run simulate`. The dashboard renders whatever the last
> run measured and labels its provenance; it never shows an illustrative figure.

Auto-clear precision is the one that must *not* move. Nobody reviews what the agent
cleared unattended, so a system that gets faster by getting sloppier is worse than no
system at all.

## Bring your own books

Nothing here is wired to a demo fixture. Point it at a period of your own:

```bash
npm run ingest -- --entity "Acme, Inc." --period 2026-05 \
                  --bank bank.csv --ledger gl.csv --invoices ap.csv
```

The reader is forgiving about headers and money formats — `Posted Date`,
`posted_date` and `POSTED-DATE` all agree; `$1,234.56`, `(1,234.56)` and
`-1234.56` all mean the same thing — and strict about what a row *means*. A row
it cannot read is reported with its table, line number and reason rather than
dropped, because a missing line is a reconciling difference someone chases for
an hour.

The bundled sample company is loaded through **exactly this path**, from CSV
text, and `sample-books/` holds the files it used so the format is documented by
example:

```bash
npm run ingest -- --sample --emit sample-books
```

Nothing downstream is permitted to know whether it got sample data or your
export.

### Closing a period for real

```bash
npm run close -- --entity "Acme, Inc." --period 2026-05
```

This is not the eval harness. It loads the entity's ingested books, applies the
Rulebook that entity has actually earned, and writes back what it decided:
**tickmarks with their evidence**, matched pairs, the exception queue, and
accrual entries **drafted for approval rather than posted**. The same close runs
from the dashboard for anyone signed in — reading is public, writing to a ledger
is not.

A tickmark is the point of the product, so it is a row, not a counter:

```json
{ "note": "1:many tie-out, clean",
  "refs": ["GL-2026-04-0046", "GL-2026-04-0047"],
  "subjectRef": "BNK-2026-04-0033" }
```

**The close does not fail when the model is unreachable.** The Rulebook still
settles everything it has earned and the remainder goes to the controller under
`model_unavailable` — labelled for what it is rather than disguised as low
confidence. A close that stops because a dependency is down is worse than one
that does less.

### The reconciliation a controller signs

`/close/reconciliation` is not a dashboard metric. It states what ties, what does
not, and why — with every unreconciled line listed at its amount, because
"97% reconciled" is not something anyone can sign:

```
58 statement lines · 4 explained · movement −$540,656.74 · unexplained $0.07

Outstanding on the statement          In the ledger, not on the statement
  STRIPE PAYOUT88368363  116,504.96     Product revenue — card settlements  −119,984.82
  WEWORK COMPANIES LLC   −39,500.00     Flexport FLE-202604-3281              57,107.54
```

Residuals inside a match are reported separately and **named** — `fx`,
`bank_fee`, `partial` — because a difference that has been explained is not the
same as one that has not.

### Payment processor settlements

A processor pays out **net of its fees**, so the deposit on the bank never
equals the revenue behind it. Reconciling that by hand is one of the most
repetitive jobs in a close. Hand it the payout breakup export and each
settlement becomes the three rows that actually explain the deposit:

```
npm run ingest -- --entity "Acme, Inc." --period 2026-05 \
                  --settlements payouts.csv --processor Dodo
```

```
bank    DODO PAYOUT txn_8891        4,074.00   ← what landed
ledger  4010 Revenue               −4,200.00   ← gross
ledger  6410 Processing fees          126.00   ← the fee
                                    ────────
                                        0.00
```

Column names are matched by alias, because no two processors agree on them, and
**a settlement whose arithmetic does not hold is refused** rather than posted:

```
gross 900.00 less fee 27.00 is 873.00, but net is 880.00 — row refused
```

**[Dodo Payments](https://dodopayments.com)** exposes exactly this file at
`GET /payouts/{id}/breakup/csv` (base `https://live.dodopayments.com`,
`Authorization: Bearer <key>`). Download it and pass it to `--settlements`, or
drop it into the import page. Stripe and other processors export the same
gross/fee/net shape and work unchanged.

### Cash reporting and the month ahead

`/close/cash` reads actuals from the **statement**, not the ledger, because the
bank is the source of truth for cash. The forward view is only useful if you can
see where each number came from, so every projected line carries its basis and
the number of periods behind it:

```
Expected in 2026-05                                   net  −$143,490.08
  Receipts                                                  $415,781.86
    average of the last 3 periods
  122 invoices already received, unpaid                   −$2,602,364.16
    invoiced and outstanding — a commitment, not a projection
  Salesforce                                                −$240,000.00
    a single invoice — not yet a pattern · thin evidence
```

A vendor seen once is reported as an anecdote rather than averaged quietly into
the total.

### It works out how your vendors settle

A matching rule's settlement shape is not declared anywhere. When a correction
seconds a standing intent, each candidate strategy — by invoice, same-day
settlement, instalments — is replayed over your real bank lines, and the one
that actually balances wins. Against the sample books the system works out on
its own that **Flexport settles in instalments**, firing 6 times at 100%
precision, with nothing in the code telling it so.

The same applies to coding: a rule's GL account and department split come from
the vendor's own coded history, not from a lookup table.

## The human gate, in practice

The part of this a controller actually touches. It is the answer to *"is the
human judgment side intuitive?"* — and the place where most agent demos quietly
cheat.

1. The queue shows only what the agent **declined to assert**, each with the
   proposal, the confidence, and why it stopped.
2. Resolving one writes a **Correction** — structured, attributable, persisted.
3. Ticking **"always do this"** does *not* make a rule. The first ask records a
   **Standing Intent** and says so:

   > *Noted — but not yet a rule. One correction is an anecdote. I'll propose a
   > rule the next time a correction agrees with it.*

4. The second agreeing correction proposes a **Rule**, citing both verbatim,
   with a **backtest** already replayed against every closed period.
5. The controller adopts or rejects. Adoption names its approver — a database
   trigger refuses an anonymous activation — and a rule whose evidence all came
   from its own adopter is marked **self-evidenced** forever.
6. **A proposal that failed the replay cannot be adopted at all.** The queue says
   so instead of offering the button, and keeps the instruction for a later
   period.
7. **Equivalent later proposals remain audit evidence, not extra behavior.** A
   canonical signature over kind, predicate, and action permits only one active
   Rule per entity. The controller's later adoption is retained and linked to
   the already-active Rule.

`npm run verify:gate` runs that entire sequence against the live database and
restores the queue afterwards:

```
PASS  first 'always do this' does NOT create a rule        outcome: intent_recorded
PASS  rule count unchanged after one correction            0 → 0
PASS  second correction proposes a rule                    cites both, backtested
PASS  proposed rule is not active until adopted            status: proposed
PASS  two different controllers → not self-evidenced
PASS  activating without an approver is refused            database trigger
PASS  adoptRule refuses a rule that failed the replay      fired 0× at 0%
```

## The agent workflow

```
ingest bank feed + AP invoices + GL
  │
  ├─ Rulebook pass      deterministic, zero tokens — anything already learned
  │
  ├─ Model pass         only the residue, batched, TOON-encoded context
  │
  ├─ The gate           confidence AND materiality; rule-settled work is trusted
  │                     to a higher ceiling because a backtest is the control
  │
  ├─ Tickmark           verified, append-only, with its evidence chain
  └─ Exception queue    everything needing judgment, with one-click resolutions
        │
        └─ Correction → Gradient step → backtest → human gate → Rulebook
```

## Stack

- **Next.js 16** (App Router, React 19) on Vercel
- **AI SDK v7** — `claude-opus-5` via Vercel AI Gateway, or a direct `ANTHROPIC_API_KEY`
- **Supabase** Postgres as the system of record, reached through a storage seam so runs
  land on the filesystem when it is not provisioned
- **Clerk** for auth
- Design tokens ported from
  [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) → `stripe`:
  white canvas, near-white cards, deep navy ink, one indigo accent
- Chart palette validated for colour-vision deficiency with the `dataviz` validator
  (lightness band, chroma floor, adjacent CVD ΔE, contrast)

## Running it

```bash
npm install
cp .env.example .env.local     # then fill in the values below
npm run check                  # does a model credential resolve?
npm run selftest               # full loop against a stand-in - no credential needed
npm run simulate               # measured eval across four periods
npm run verify:db              # prove the invariants against the live database
npm run verify:gate            # prove the evidence gate, then restore the queue
npm run verify:loop            # the whole product loop on ingested books
npm run verify:all             # full verification; requires Supabase by default
npm run dev                    # dashboard on http://localhost:3000
```

**Required** — one model credential. Resolved in this order, so the same code
runs against whatever the deployment has:

1. `TICKMARK_BASE_URL` (+ `TICKMARK_API_KEY`, `TICKMARK_MODEL`) — any
   OpenAI-compatible endpoint: a sponsor or in-house inference gateway,
   OpenRouter, or a self-hosted model. Set `TICKMARK_PRICE_IN` /
   `TICKMARK_PRICE_OUT` (USD per 1M tokens) so cost is priced honestly instead
   of reported as `$0.00`. Structured outputs remain disabled by default for
   unknown gateways. If the selected endpoint and model support JSON Schema
   structured outputs, explicitly opt in with
   `TICKMARK_SUPPORTS_STRUCTURED_OUTPUTS=1`.
2. `ANTHROPIC_API_KEY` — the Anthropic API directly.
3. Nothing set — the plain `provider/model` string routes through the
   [Vercel AI Gateway](https://vercel.com/docs/ai-gateway), authenticated by the
   `VERCEL_OIDC_TOKEN` that `vercel link` writes.

For example, a local Ollama model that supports structured outputs can be
configured in `.env.local` as follows:

```dotenv
TICKMARK_BASE_URL=http://localhost:11434/v1
TICKMARK_API_KEY=ollama
TICKMARK_MODEL=llama3.2:latest
TICKMARK_SUPPORTS_STRUCTURED_OUTPUTS=1
TICKMARK_PRICE_IN=0
TICKMARK_PRICE_OUT=0
```

A full four-period run is roughly 75k input / 21k output tokens — about **$0.18
on Haiku 4.5, $0.90 on Opus 5**. That is the entire demo, not a monthly bill.

**Required for database-backed workflows and full verification** — `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`. Apply the migrations in `supabase/migrations/` before
running the database verification suites. Local runs can still use the filesystem
fallback in `data/`, but `npm run verify:all` exits nonzero when it has to skip database
suites. Set `ALLOW_PARTIAL_VERIFY=1` only when you intentionally want that partial run
to succeed.

Create the Supabase project with the Data API's *"automatically expose new tables"*
switched **off**. The migration then grants only `service_role` — held server-side by
route handlers behind Clerk — and explicitly revokes `anon` and `authenticated`, so the
publishable key cannot reach a ledger row. RLS is enabled on every table as defence in
depth.

## Layout

```
src/lib/ingest/     CSV reader + loader - the path every book takes in
src/lib/seed/       the sample company, generated then ingested like any customer
src/lib/agent/
  rules.ts          the deterministic Rulebook engine — zero tokens
  llm.ts            the model-backed residue, TOON-encoded
  close.ts          one Close Run: rules first, model second, then the gate
  gradient.ts       corrections → candidate rules → backtest
  controller.ts     the human gate, simulated from ground truth
  simulate.ts       the multi-period eval harness
  backtest-db.ts    replays a proposed rule against the entity's own history
  run-period.ts     load ingested books, close them, persist the result
src/lib/store/      Supabase adapter + filesystem fallback behind one interface
supabase/migrations one SQL file; the invariants live here as triggers
CONTEXT.md          the domain model — read before naming anything
```

## Domain language

Terms are load-bearing and each one records what it must not be confused with. See
[CONTEXT.md](CONTEXT.md). The three that matter most:

- An **Exception** is not an error — it is the system correctly asking for judgment.
- A **Tickmark** is not an approval — verification and authority to post are different controls.
- A **Rule** is not a prompt — it is deterministic, inspectable, and free to run.
