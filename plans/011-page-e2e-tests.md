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
