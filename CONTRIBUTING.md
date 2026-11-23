# Contributing

Thanks for looking. Tickmark is small enough to read end to end; start with
[CONTEXT.md](CONTEXT.md), because its terms are load-bearing.

## Setup

```bash
nvm use            # Node 24, see .nvmrc (22.18+ works)
npm ci
npm run verify     # lint, typecheck, tests, eval check, README graphics check
```

No credentials are needed for any of that. `npm run dev` serves the dashboard;
signing in needs Clerk keys, and database-backed pages need Supabase (see
`.env.example`).

## What a change should keep true

These are the product. A change that weakens one needs to say so plainly in
the pull request.

1. A fresh model suggestion never clears work unattended. Only an active,
   backtested rule can, and only under the rule ceiling.
2. A rule needs two distinct corrections of its own kind and a passing replay.
3. A matching rule that cannot pick one candidate hands the line to a person.
4. A correction that contradicts an active rule suspends it.
5. Money is integer cents end to end. Parse amounts from their digits.
6. Debits equal credits, tickmarks are append-only, preparer differs from
   approver. These live in `supabase/migrations/` as triggers.

## Tests and the eval

- Put a test next to the module it covers (`foo.ts`, `foo.test.ts`); the runner
  is `node:test` through `tsx`.
- A bug fix starts with a test that fails for the reason the bug happened.
- If your change moves any number in `eval/results/offline.json`,
  `npm run eval -- --check` fails. Rerun `npm run eval`, commit the new file,
  and explain in the pull request why the numbers moved. Do not tune the agent
  against the held-out seeds; if a held-out run exposes a defect, fix it, say
  so, and add a fresh held-out round, as `eval/companies.ts` describes.
- If the eval results change, regenerate the README graphics with
  `npm run readme:assets`.

## Pull requests

Keep them focused, describe the behaviour change and how you verified it, and
make sure `npm run verify` passes. CI runs the same checks plus a production
build and `npm run smoke`, which starts that build and requests every public
route. A new page belongs in its list in `scripts/smoke.ts`, and in
`src/app/sitemap.ts` if anyone may read it.

Report security issues privately; see [SECURITY.md](SECURITY.md).
