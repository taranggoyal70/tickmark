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

How access works, so a report can say which promise broke:

- Books belong to the person who imported them (`entity_members`). The app
  reads an entity only if it is a public demo or the viewer is a member, and
  every write carries the viewer's memberships inside its query, so an id from
  someone else's books matches no row. `src/lib/access.ts` holds the rules and
  `npm run verify:tenancy` checks them against a database.
- Only the bundled synthetic company is a public demo (`entities.public_demo`).
  Its pages and its binder are readable without signing in so the hosted demo
  can be watched; it cannot be written to from the app.
- Each signed-in person may start `TICKMARK_CLOSES_PER_DAY` closes in a rolling
  24 hours (default 10), claimed under a lock, so model spend per account is
  bounded.

Known and documented, not vulnerabilities in themselves:

- **One owner per company.** There is no way to share books with a colleague
  yet. Books imported before migration `0008_tenancy.sql` have no owner and
  are visible to nobody. See "Status and limits" in the README.
- **The Content-Security-Policy is partial.** It sets `base-uri`, `object-src`
  and `frame-ancestors`; a `script-src` policy waits on the Clerk instance's
  domains.

## Handling secrets

- `SUPABASE_SERVICE_ROLE_KEY`, `CLERK_SECRET_KEY` and model keys are read only
  on the server. Never prefix them with `NEXT_PUBLIC_`.
- The migrations revoke `anon` and `authenticated` on every table and enable
  row-level security, so the publishable key cannot read a ledger row. The
  functions that take a user id are executable only by `service_role`.
- `.env*` files are git-ignored except `.env.example`, which holds no values.
