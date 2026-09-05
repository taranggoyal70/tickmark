# Tickmark - domain context

> A **tickmark** is the small symbol an accountant puts beside a ledger line to
> say *"I checked this, and here is how."* Auditors have used them for a century.
> This product issues tickmarks - and earns the right to issue them without asking.

Terms below are load-bearing. Each one lists what it must **not** be confused with.
Read this before naming anything new.

## The workflow we automate

The **month-end close**: the 5-10 business day scramble after a month ends where
the accounting team proves the books are right. We take three of its most
repetitive, most judgment-heavy steps end to end:

1. **Bank reconciliation** - tie every line on the bank statement to the general
   ledger, and explain every line that does not tie.
2. **AP invoice coding** - decide which GL account, department, and class each
   vendor invoice hits.
3. **Accrual completeness** - find the recurring costs that were *incurred* this
   period but never invoiced, and accrue them.

We do **not** do: consumer banking, trading, lending, or payment processing.

## Core nouns

### Period
One fiscal accounting month (`2026-01`). Has a **cut-off date**, after which
sub-ledgers are frozen. A Period moves `open → in_close → closed`.

- Not a calendar month. Fiscal calendars drift (4-4-5, 52/53-week).
- Not a Close Run. A Period can be re-run many times.

### Close Run
One execution of the close agent against one Period. Immutable once finished.
Carries its own cost, duration, token count, and the **Rulebook version** it ran
against - so any result is reproducible.

- Not a Period. Not a deployment.

### Ledger Entry
A posted line in the general ledger: date, account, amount, memo, source.

### Bank Line
A line on the bank statement: date, description, amount, counterparty.
The bank is the **external source of truth** for cash. The GL is not.

### Match
A link between Bank Lines and Ledger Entries. Cardinality is the hard part and
it is genuinely all four:

| Shape | Real-world cause |
|---|---|
| 1:1 | ordinary payment |
| 1:many | one ACH batch paying six invoices |
| many:1 | an invoice paid in two installments |
| many:many | a lockbox deposit against partial payments |

- Not an equality check. Amounts legitimately differ (FX, bank fees, partial pay).

### Tickmark
An **immutable** assertion that one line is verified, carrying who/what/when/why
and its **Evidence Chain**. Issued by the agent (with a confidence) or a human.

- Not an approval. Approving a journal entry is a separate control with separate
  authority. A tickmark says *"this is verified"*, not *"this may post."*
- Not reversible. You supersede a tickmark with a new one; you never edit one.

### Exception
A line the agent would not tickmark on its own, routed to a human queue.

- **Not an error.** An exception is the system correctly recognising that it needs
  judgment. Exceptions going *up* after a policy change can be the right outcome.
- Three causes, and the UI must distinguish them: `low_confidence`,
  `over_materiality`, `policy_requires_human`.

### Materiality Threshold
The dollar amount above which a human must review **regardless of confidence**.
This is how real controllers allocate attention, and it is a hard gate, not a
tiebreaker. A $12 bank fee and a $2.4M wire do not deserve the same scrutiny.

- Not a confidence threshold. They compose; neither overrides the other.
- Not one number. See Rule Ceiling.

### Rule Ceiling
The higher threshold that applies when a decision was settled by a **Rule**
rather than by the model. A backtested rule carries its own control - the
replay, plus the corrections that authorised it - so it is trusted further than
a fresh model judgment on an item it has never seen.

This is the mechanism by which learning actually buys automation: a vendor only
becomes hands-off once there is evidence and a passing replay behind it.

- Not an exemption. Nothing clears above the ceiling, ever.
- Not a confidence bonus. The rule still has to fire cleanly or it hands off.

### Journal Entry (JE)
A proposed accounting entry. Debits must equal credits - checked arithmetically,
never by the model. Carries **preparer** and **approver**, which must be
different principals (segregation of duties).

## The learning system

### Rule
A **deterministic**, versioned decision the agent compiled out of human
corrections. Executes with **zero LLM calls**.

> Learning here does not mean a better prompt. It means the judgment gets
> compiled into something cheap, inspectable, and testable. This is why cost per
> close falls instead of rising.

- Not a prompt. Not a few-shot example. A Rule is code with a predicate.
- Not a black box. A controller can read, edit, disable, and version a Rule.

### Rulebook
The versioned set of active Rules for an entity. **The weights.**

### Correction
One human action in the exception queue - accept, amend, or reject - captured
structurally (not as free text). **The loss signal.**

### Gradient Step
One bounded cycle that reads Corrections and proposes Rule diffs.

```
Rulebook (the weights)
  -> Close Run                    (forward pass)
  -> Corrections in the queue     (loss signal)
  -> distill + aggregate          (gradient)
  -> proposed Rule diffs          (gradient step)
  -> controller accepts / rejects (the human gate)
  -> back to the Rulebook
```

Borrowed, with credit, from [backpass](https://github.com/kunchenguid/backpass).
Two of its constraints matter more in accounting than they do in code:

- **Evidence-gated.** Every proposed Rule cites >= 2 distinct real Corrections,
  verbatim, **and those Corrections must be about the same kind of decision the
  Rule makes**. A coding rule justified by reconciliation corrections is not
  evidenced, it is decorated, and an auditor would say so.
- **Analysis never writes.** Proposing and applying are separate operations with
  separate authority. That is segregation of duties, which we get for free.

### Standing Intent
A controller's declaration, made while resolving one Exception, that this
judgment should become a Rule. It is **not** a Rule and never acts on its own.

It exists because the honest answer to "make this automatic" is often *"not
yet"*. One correction is an anecdote. The Standing Intent is how the system says
*I heard you, and I need to see it once more* without losing the instruction.
When a second Correction matches, the Gradient Step proposes the Rule citing
both.

- Not a Rule. It never codes, matches, accrues, or posts anything.
- Not a queue item. Resolving the Exception is complete; the intent rides along.
- Not permanent. A controller can withdraw one.

### Rule Adoption
The act of moving a proposed Rule to `active`. The **agent** proposes; a
**controller** adopts. Those are different parties, so preparer and approver are
already distinct - Corrections are evidence, not the proposal.

A Rule whose every citation came from the same person who adopted it is marked
**self-evidenced** and stays marked. Nothing blocks it - the backtest is still
the gate - but an auditor asking *"who decided this, and did anyone else look?"*
gets an answer without having to reconstruct it.

- Not the same as a Tickmark. A tickmark verifies one line; adoption changes how
  every future line is decided.

### Backtest
Before a proposed Rule is accepted, it is replayed against **all prior closed
periods**. The controller sees exactly what it would have changed and what it
would have broken. No rule is adopted on a promise.

- Not a test suite. A backtest is evidence for a human decision.

## Invariants

1. Debits equal credits. Arithmetic, never model output.
2. No tickmark is ever mutated or deleted - only superseded.
3. Nothing above the Materiality Threshold auto-posts. Ever.
4. Preparer != approver on every journal entry.
5. Every automated decision traces to either a Rule (with its Corrections) or a
   Close Run (with its Evidence Chain). No orphan decisions.
6. A Rule that has never been backtested cannot be activated.
7. A Rule's evidence is the same kind as the Rule. Coding evidences coding.
8. A Standing Intent never decides anything. Only an active Rule does.
9. Adoption is attributable. Every active Rule names who adopted it and when.
