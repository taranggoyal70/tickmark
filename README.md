<h1 align="center">Tickmark</h1>
<p align="center"><b>The month-end close that gets cheaper every month.</b></p>
<p align="center">
An agent that codes the AP ledger and reconciles the bank, hands a controller only what
genuinely needs judgment, and compiles every correction they make into a deterministic
rule — so the judgment gets made once, and then runs for free.
</p>

---

> A **tickmark** is the small symbol an accountant puts beside a ledger line to say
> *"I checked this, and here is how."* Auditors have used them for a century. This
> product issues tickmarks — and earns the right to issue them without asking.

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

## Stack

- **Next.js 16** (App Router, React 19) on Vercel
- **AI SDK v7** — `claude-opus-5` via Vercel AI Gateway, or a direct `ANTHROPIC_API_KEY`
- **Supabase** Postgres as the system of record, reached through a storage seam so runs
  land on the filesystem when it is not provisioned
- **Clerk** for auth
- Design tokens ported from
  [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) → `linear.app`
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
npm run dev                    # dashboard on http://localhost:3000
```

**Required** — one model credential. Resolved in this order, so the same code
runs against whatever the deployment has:

1. `TICKMARK_BASE_URL` (+ `TICKMARK_API_KEY`, `TICKMARK_MODEL`) — any
   OpenAI-compatible endpoint: a sponsor or in-house inference gateway,
   OpenRouter, or a self-hosted model. Set `TICKMARK_PRICE_IN` /
   `TICKMARK_PRICE_OUT` (USD per 1M tokens) so cost is priced honestly instead
   of reported as `$0.00`.
2. `ANTHROPIC_API_KEY` — the Anthropic API directly.
3. Nothing set — the plain `provider/model` string routes through the
   [Vercel AI Gateway](https://vercel.com/docs/ai-gateway), authenticated by the
   `VERCEL_OIDC_TOKEN` that `vercel link` writes.

A full four-period run is roughly 75k input / 21k output tokens — about **$0.18
on Haiku 4.5, $0.90 on Opus 5**. That is the entire demo, not a monthly bill.

**Optional** — `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Without them runs persist
to `data/`. With them, apply `supabase/migrations/0001_init.sql` first.

Create the Supabase project with the Data API's *"automatically expose new tables"*
switched **off**. The migration then grants only `service_role` — held server-side by
route handlers behind Clerk — and explicitly revokes `anon` and `authenticated`, so the
publishable key cannot reach a ledger row. RLS is enabled on every table as defence in
depth.

## Layout

```
src/lib/seed/       fixture entity + deterministic period generator (with ground truth)
src/lib/agent/
  rules.ts          the deterministic Rulebook engine — zero tokens
  llm.ts            the model-backed residue, TOON-encoded
  close.ts          one Close Run: rules first, model second, then the gate
  gradient.ts       corrections → candidate rules → backtest
  controller.ts     the human gate, simulated from ground truth
  simulate.ts       the multi-period eval harness
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
