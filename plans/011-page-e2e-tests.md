# 011 — Page + smoke E2E tests (E11)

**Base commit:** `5eff48f` · **Plan:** E11 · **Category:** Tests · **Risk:** MED · **Size:** L (multi-day)

## Goal
Pages and the auth→sprint→session→approve→SOW flow have zero coverage; only tRPC + RLS
layers are tested.

## Change
- Add Playwright. Write the happy-path smoke: sign-in → launch sprint → IC session →
  approve opportunity → SOW preview, reusing the embedded-postgres fixtures.
- Add vitest **component tests** for `/me` and `/sprint/[id]` using the tRPC caller
  factory in `server/trpc/caller.ts`.
- Cover the new `ConfirmDialog` (004) and tablist (005) from Plan B (may already be done
  in those items — consolidate).
- Add `npm run test:e2e` script.

## TDD
This item *is* test creation. Each Playwright/component test must fail meaningfully before
the wiring is in place (or assert real behavior that already exists, watching it go green).

## Gate
`npm test` + new `npm run test:e2e`.

## Notes
Keep cross-tenant RLS assertions intact. Do not touch RLS policies.

## Findings (as built)
- **Page tests:** added `server/trpc/pages.integration.test.ts` — hermetic
  (embedded-postgres) data-contract tests for `/me` (session.myDashboard: ordered
  sessions, completed-session detail, empty state) and `/sprint/[id]` (get +
  progress + ranked opportunities). The integration config is node-env, so it
  asserts the caller payload each page consumes rather than rendering the async
  Server Components.
- **Playwright smoke:** `e2e/smoke.spec.ts` + `playwright.config.ts`, run via
  `npm run test:e2e`. The plan's "reuse embedded-postgres fixtures" isn't viable:
  the app's auth needs Supabase Auth (not just Postgres), so the smoke runs
  against `npm run dev` + the seeded Supabase dev project using the `/sign-in/dev`
  shortcut. It is **not hermetic** and stays **out of the CI gate**; needs
  `npm run db:seed && npm run db:seed:dashboard`.
- **Dev-server flake:** `next dev` intermittently throws a first-compile webpack
  chunk error (`__webpack_require__.n is not a function`) on a freshly-compiled
  route, which crashes the page until a reload recompiles. `retries: 2` rides it
  out — the smoke passes (Playwright exit 0). Production `build` is clean.
- **Gotcha:** never run `npm run build` while a `next dev` server is live — they
  share `.next` and the build corrupts the running dev server's module graph.
