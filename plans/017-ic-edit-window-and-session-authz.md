# Plan 017: Make the IC edit window real (persist edits) + close the session authz gap

> **Executor instructions**: Follow step by step; verify each step. On any STOP
> condition, stop and report. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 430d2f4..HEAD -- components/session/EditCaptures.tsx server/trpc/routers/session.ts app/(app)/me/`
> On mismatch with the excerpts below, STOP.

## Status

- **Priority**: P0 — data-loss bug + broken privacy promise + authz gap
- **Effort**: M
- **Risk**: LOW — additive mutations, one where-clause fix
- **Depends on**: none (independent of the engine track; merge any order)
- **Category**: bug / security
- **Planned at**: commit `430d2f4`, 2026-06-11

## Why this matters

The privacy gate promises ICs: "Edit or remove anything you said for 7 days
after each session." That promise is currently FALSE twice over: (1) the edit
page's Save updates only local React state — nothing persists; (2) there is no
edit-window enforcement anywhere. Separately, `session.get` checks tenant but
not user, so any member of a tenant can open another IC's live conversation —
a privacy breach once plan 013 makes conversations real. ICs were promised
anonymity and control; this plan delivers the control part and seals the leak.

## Current state

- `components/session/EditCaptures.tsx:39-48` — client-only state:

  ```ts
  function save(id: string) {
    setCaps((cs) => cs.map((c) => (c.id === id ? { ...c, summary: buffer } : c)));
    setEditing(null);
  }
  function toggleRemove(id: string) {
    setCaps((cs) => cs.map((c) => (c.id === id ? { ...c, removed: !c.removed } : c)));
  }
  ```

  The "Done" button is a plain `<Link>` back to `/me`. No server action, no
  mutation. The page even tells the IC "Edits propagate to any opportunity that
  cites this capture" — currently false.
- `server/trpc/routers/session.ts` has ONLY queries (`myDashboard`, `get`,
  `editView`). Zero mutations.
- `editView` (line ~114) correctly scopes by owner:
  `and(eq(sessions.id, input.id), eq(sessions.userId, ctx.session.userId))`.
- `session.get` (line ~95) does NOT:

  ```ts
  .where(eq(sessions.id, input.id));   // tenant RLS only — any tenant member passes
  ```

- `captures` already has `isEdited` / `isRemoved` booleans (`db/schema.ts:189-190`)
  and `sessions.editWindowEndsAt` exists (`db/schema.ts:169`) — plan 014
  populates it; for sessions completed before 014 lands it may be NULL (treat
  NULL as closed).
- Conventions: Zod inputs, `withTenantContext`, co-located tests; a11y per
  ConfirmDialog/aria-live patterns from plans 004-007.

## Commands you will need

| Purpose     | Command                    | Expected |
|-------------|----------------------------|----------|
| Unit        | `npm test`                 | all pass |
| Integration | `npm run test:integration` | all pass |
| Full gate   | `npm run verify`           | exit 0   |

## Scope

**In scope**:
- `server/trpc/routers/session.ts` (fix `get`; add `updateCapture` mutation)
- `components/session/EditCaptures.tsx` (+ test)
- `app/(app)/me/sessions/[id]/edit/page.tsx` (closed-window state)
- `server/trpc/router.integration.test.ts` or `db/sessions.integration.test.ts`
  (extend)

**Out of scope**:
- Capture creation (014), conversation UI (015).
- GDPR erasure tooling (manual runbook — plan 021).
- The `opportunityEvidence` linkage — removed captures must simply stop
  rendering as evidence; verify `opportunity.get` already filters
  `isRemoved` (check `server/trpc/routers/opportunity.ts:38-52`; if it does
  not filter, add the filter — one line, in scope).

## Git workflow

- Branch: `fix/017-edit-window-persistence`; conventional commits
  (`fix(session): persist IC capture edits + enforce edit window`). No push
  unless asked.

## Steps

### Step 1: Fix `session.get` ownership

Add `eq(sessions.userId, ctx.session.userId)` to the where clause, mirroring
`editView`. Managers/sponsors have no legitimate path to an IC's live session
(per CLAUDE.md privacy rules; Twistag debugging goes through audited
`withTwistagContext`, not this route).

**Verify**: integration test — same-tenant other-user `session.get` →
NOT_FOUND. Existing IC flow still passes.

### Step 2: `session.updateCapture` mutation

`tenantProcedure` mutation, input
`{ sessionId: uuid, captureId: uuid, summary?: string.min(3).max(500), isRemoved?: boolean }`
(at least one of summary/isRemoved required — Zod `.refine`). Inside
`withTenantContext`:

1. Load session scoped by `userId = ctx.session.userId` → else NOT_FOUND.
2. Window check: `editWindowEndsAt != null && editWindowEndsAt > now()` → else
   `FORBIDDEN` with message "The 7-day edit window for this session has closed."
3. Update the capture (must belong to that session), set `isEdited: true` when
   summary changes, set `isRemoved` as sent.

**Verify**: integration tests — edit inside window persists + flags
`isEdited`; expired window → FORBIDDEN; NULL window → FORBIDDEN; other user's
capture → NOT_FOUND.

### Step 3: Wire the UI

`EditCaptures.tsx`: `save()` and `toggleRemove()` call the mutation (server
action wrapper or client tRPC — match whatever plan 015 established; if 015
hasn't landed, use a server action in `app/(app)/me/sessions/[id]/edit/actions.ts`).
Pending state on the row, `aria-live` confirmation ("Saved"), failure keeps the
buffer and shows retry copy. Remove becomes a soft toggle with the existing
visual treatment.

**Verify**: dev-server manual pass as IC persona — edit, reload page, edit
persists; remove, reload, stays removed.

### Step 4: Closed-window state

`app/(app)/me/sessions/[id]/edit/page.tsx`: when the window is closed, render
read-only captures + "This session can no longer be edited — the 7-day window
closed on {date}." No edit affordances.

**Verify**: seed/adjust a session with past `editWindowEndsAt` → read-only
state renders.

## Test plan

- Integration: the four `updateCapture` cases + `session.get` ownership case.
- Component test for EditCaptures: save calls mutation, failure preserves
  buffer, removed row styling. Model on the existing EditCaptures/ConfirmDialog
  test patterns.

## Done criteria

- [ ] `npm run verify` exits 0
- [ ] Edit → reload → persisted (manual, dev seed)
- [ ] Window enforcement server-side (tests), closed-state UI present
- [ ] `session.get` requires ownership (test)
- [ ] `opportunity.get` excludes `isRemoved` captures (verified or fixed)

## STOP conditions

- Excerpts above don't match the live files (drift).
- You find OTHER callers of `session.get` that legitimately need non-owner
  access (search first: `grep -rn "session.get" app components`) — report
  before changing semantics.

## Maintenance notes

- Plan 014 sets `editWindowEndsAt` on completion — the NULL-as-closed rule here
  protects pre-014 rows either way.
- Future "manager view of aggregate edits" features must NOT reuse
  `updateCapture` — new audited procedure instead.
- Reviewer: confirm no path renders a removed capture (report, opportunity
  evidence, edit page).
