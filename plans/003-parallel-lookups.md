# 003 — Parallelize manager/sponsor resolution (A9)

**Base commit:** `5eff48f` · **Plan:** A9 · **Category:** Perf · **Risk:** LOW

## Problem
`sprint.get` resolves the two users serially (`server/trpc/routers/sprint.ts:345-346`):

```ts
const manager = await resolveUser(s.managerId);
const sponsor = await resolveUser(s.sponsorId);
```

## Change
```ts
const [manager, sponsor] = await Promise.all([
  resolveUser(s.managerId),
  resolveUser(s.sponsorId),
]);
```

Pure sequencing change — `resolveUser` reads from an in-memory participants map first,
then falls back to a `users` query; both lookups are independent.

## TDD
No new behavior — existing `sprint.get` integration tests must stay green. If none assert
manager/sponsor identity, add/confirm one in `router.integration.test.ts`.

## Gate
`npm run test:integration`.
