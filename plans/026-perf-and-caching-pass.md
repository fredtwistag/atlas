# Plan 026: Performance + caching pass (vetted set)

> **Executor instructions**: Follow step by step; verify each step. Each item
> here was vetted against the code at `430d2f4` — if an excerpt no longer
> matches, skip that item and note it rather than improvising. Update
> `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 430d2f4..HEAD -- middleware.ts "app/(app)/layout.tsx" lib/sprint-read.ts db/schema.ts server/trpc/routers/twistag.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW–MED (middleware change is the riskiest item — it touches auth
  session refresh; its step has an explicit invariant)
- **Depends on**: plans/018 (Next version settled first)
- **Category**: perf
- **Planned at**: commit `430d2f4`, 2026-06-11

## Why this matters

Pilot scale is small, but two surfaces are latency-visible: the marketing
landing (every prospect) and the report (shared to sponsors/execs). The items
below are the audit's vetted wins — each cited from code, no speculative
micro-optimization. Items the audit REJECTED as not-worth-it (lucide barrel
imports, tRPC HTTP cache headers, audit-log archival) are recorded in
`plans/README.md` — do not do them.

## Current state (the five vetted items)

1. **Middleware auths public pages**: `middleware.ts` calls
   `supabase.auth.getUser()` (network round-trip to Supabase) BEFORE checking
   `isPublic(path)` — every marketing/landing hit pays it. The comment in the
   file warns getUser() must run to refresh sessions — that applies to
   SIGNED-IN users; anonymous hits with no auth cookies get nothing from it.
2. **Per-request duplicate loads**: `app/(app)/layout.tsx:10-22` awaits
   `getCurrentUser()` then `api.sprint.currentForTenant()` +
   `api.session.myDashboard()`; pages under it (e.g.
   `app/(app)/sprint/[id]/page.tsx`) re-fetch overlapping sprint data via
   `api.sprint.get` + `api.sprint.progress` — both call `loadSprint`-family
   functions in `lib/sprint-read.ts`. No `React.cache()` anywhere
   (`grep -rn "cache(" lib/ server/` → none).
3. **No composite index for the hottest query**: every (app) layout render
   runs current-sprint-for-tenant (`server/trpc/routers/sprint.ts:31-42`,
   filter on tenant + status + order by created_at). `db/schema.ts` defines
   indexes only in migrations; check `db/migrations/0002_dashboard_tables.sql`
   for what exists (audit found `sprints_tenant_idx` on tenant_id only).
4. **Audit viewer JSON filter unindexed**:
   `server/trpc/routers/twistag.ts:298` filters
   `metadata ->> 'actor'` raw; plus action/date filters with no supporting
   composite index (`twistag.ts:305-310` keyset pagination exists and is
   good).
5. **Sequential layout awaits**: `getCurrentUser()` then `getApi()` then the
   parallel pair — `getApi()` (cookie read + context build) can start
   alongside `getCurrentUser()`.

## Commands you will need

| Purpose     | Command                                   | Expected |
|-------------|-------------------------------------------|----------|
| Full gate   | `npm run verify`                          | exit 0   |
| Build check | `NEXT_DIST_DIR=.next-verify npm run build`| route table shows `/` as static (○) |
| Migrate dev | `npm run db:migrate`                      | applies 0010 |

## Scope

**In scope**: `middleware.ts`, `app/(app)/layout.tsx`, `lib/sprint-read.ts` +
`lib/session.ts` (cache wrappers), `db/migrations/0010_perf_indexes.sql`,
`server/trpc/routers/twistag.ts` (only if the functional index needs a query
tweak), tests alongside.

**Out of scope**: report ISR/revalidation (force-dynamic stays — reports must
always be fresh for approvals; revisit post-launch with real traffic), any
client-bundle work, tRPC transport changes.

## Git workflow

- Branch: `perf/026-caching-pass`; conventional commits. No push unless asked.

## Steps

### Step 1: Middleware short-circuit (the careful one)

In `middleware.ts`: if `isPublic(path)` AND the request carries no Supabase
auth cookies (`request.cookies.getAll().some(c => c.name.startsWith("sb-"))`
→ false), return `NextResponse.next()` before creating the client.
INVARIANT: signed-in users (cookies present) must STILL hit `getUser()` on
public paths so session refresh keeps working — only the anonymous+public
combination skips.

**Verify**: e2e suite passes; manual — anonymous `/` makes zero Supabase auth
calls (network tab), signed-in user navigating `/` → `/me` stays signed in
after >1h-old session (or simulate by clearing only the access token, keeping
the refresh token).

### Step 2: Static marketing confirmation

After Step 1, run the build and confirm `/` and `/pricing` emit as static
(○/●) in the route table. If they show ƒ (dynamic), find the dynamic API
usage that forces it (`next build` prints the reason in 15.x) and fix or
document.

**Verify**: build route table screenshot/text in the PR.

### Step 3: `React.cache()` per-request dedupe

Wrap the per-request lookups: `getCurrentUser` (in `lib/session.ts`) and the
`loadSprint` / `loadSprintProgress` family (`lib/sprint-read.ts`) exports in
`React.cache()`. Layout + page then share one fetch per request. Keep the
functions' signatures identical.

**Verify**: add a temporary counter assertion in an integration/unit test if
the harness allows; otherwise verify via dev-server logging (one
`loadSprint` per request where two ran before) and remove the temp logging.
Gate green.

### Step 4: Parallelize layout

`app/(app)/layout.tsx`: start `getCurrentUser()` and `getApi()` together
(`Promise.all`), keep the tenant-kind guard semantics identical (twistag
users skip the sprint/session fetches).

**Verify**: page renders for all three persona kinds (manager, IC, twistag).

### Step 5: Indexes (migration 0010)

```sql
CREATE INDEX IF NOT EXISTS sprints_tenant_status_created_idx
  ON sprints (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_at_idx
  ON audit_log (action, at DESC);
CREATE INDEX IF NOT EXISTS audit_log_metadata_actor_idx
  ON audit_log ((metadata ->> 'actor'));
```

Confirm column names against `db/schema.ts` first (audit_log columns at
line 29+). Run `EXPLAIN` for the current-sprint query and one filtered audit
query in the integration harness before/after; paste both plans in the PR.

**Verify**: `npm run db:migrate` exit 0; EXPLAIN shows index usage on the
current-sprint query.

## Test plan

- The e2e suite is the middleware regression net (Step 1 is the only risky
  change).
- EXPLAIN evidence for Step 5.
- All persona layouts render (Step 4).

## Done criteria

- [ ] `npm run verify` + `npm run test:e2e` exit 0
- [ ] Anonymous marketing hit: no Supabase call (verified once, stated in PR)
- [ ] `/` static in build output
- [ ] One `loadSprint` per request on the sprint dashboard
- [ ] 0010 applied; EXPLAIN evidence in PR

## STOP conditions

- Step 1's invariant can't be satisfied (e.g. Supabase cookie names differ
  from `sb-` prefix in this setup — CHECK the actual cookie names in dev
  first) — report rather than guessing prefixes.
- Step 3 changes behavior because a callsite mutates returned objects —
  report; cache() returns shared references.

## Maintenance notes

- New audit-viewer filters need matching indexes — the EXPLAIN habit from
  Step 5 is the review bar.
- When traffic justifies it: report-page ISR + `revalidatePath` on approval is
  the next perf lever (deliberately deferred).
