# 001 — Scope the captures count to the sprint (A1)

**Base commit:** `5eff48f` · **Plan:** A1 · **Category:** Correctness/Perf · **Risk:** LOW

## Problem
`sprint.progress` counts **all tenant captures across every sprint**, inflating
`capturesCount` and growing into an unbounded full-table scan.
`server/trpc/routers/sprint.ts:401`:

```ts
const caps = await tx.select({ id: captures.id }).from(captures);
```

## Critical correctness note
`captures` has **no `sprintId` column** (`db/schema.ts:174`). It links via
`sessionId → sessions.sprintId` (`db/schema.ts:156`, `:179`). Count captures with an
**inner join through `sessions`** filtered on `sessions.sprintId = input.id` — **not** a
`captures.sprintId` filter (that column does not exist). RLS already scopes to tenant;
this scopes to the sprint.

## Change
Replace the unfiltered select with a join-and-count:

```ts
const caps = await tx
  .select({ id: captures.id })
  .from(captures)
  .innerJoin(sessions, eq(captures.sessionId, sessions.id))
  .where(eq(sessions.sprintId, input.id));
```

`sessions` must be imported in the router (verify the import list).

## TDD
Add an integration case in `server/trpc/router.integration.test.ts`: seed two sprints,
each with sessions + captures; assert `progress.capturesCount` reflects only the queried
sprint's captures. Watch it fail against the unscoped query first.

## Gate
`npm run test:integration` (full gate before Done).

## Maintenance
If the conversation/LLM slice later writes captures with a direct `sprintId`, revisit the join.
