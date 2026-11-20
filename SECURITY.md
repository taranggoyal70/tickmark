# Security

Tickmark touches a company's books, so a security report gets a person's
attention quickly.

## Reporting a vulnerability

Please report privately through GitHub's
[private vulnerability reporting](https://github.com/taranggoyal70/tickmark/security/advisories/new)
rather than in a public issue. Include the affected route or module, the steps
to reproduce, and what an attacker gains. Remove any real financial data or
credentials from what you send.

You can expect an acknowledgement within three working days and a status update
within ten. Fixes are released on `main`; there are no maintained release
branches.

## Scope and known boundaries

Worth reporting:

- reading or writing an entity's books, queue, rules or binder without being
  signed in, or as a user who should not have access
- a way to activate a rule without a passing backtest, without two pieces of
  evidence, or without a named approver
- a way to post an unbalanced journal entry, or to post with preparer equal to
  approver
- a way to mutate or delete a tickmark
- prompt content that causes the model output to be written to the books
  without passing the gate

Known and documented, not vulnerabilities in themselves:

- **No tenant isolation yet.** Any signed-in user can import books for, close,
  and read any entity. Treat a deployment as single-tenant until per-entity
  access control lands. See "Status and limits" in the README.
- The dashboard pages are readable without signing in so the hosted demo can
  be watched. They show the synthetic sample company. Writes, the exception
  queue, and the binder download require sign-in; the binder can be opened to
  the public only by setting `TICKMARK_PUBLIC_READ=1`.

## Handling secrets

- `SUPABASE_SERVICE_ROLE_KEY`, `CLERK_SECRET_KEY` and model keys are read only
  on the server. Never prefix them with `NEXT_PUBLIC_`.
- The migrations revoke `anon` and `authenticated` on every table and enable
  row-level security, so the publishable key cannot read a ledger row.
- `.env*` files are git-ignored except `.env.example`, which holds no values.
