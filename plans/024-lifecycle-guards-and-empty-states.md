# Plan 024: Sprint-lifecycle guards + missing empty states

> **Executor instructions**: Follow step by step; verify each step. On any STOP
> condition, stop and report. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 430d2f4..HEAD -- server/trpc/routers/sprint.ts "app/(app)/sprint/" components/`
> Note: plan 020 moves the nudge SEND into a worker — if 020 landed first, the
> status check in Step 1 goes at the tRPC enqueue layer (the mutation that
> emits `nudge/requested`).

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (coordinate with 020 on nudge file)
- **Category**: bug
- **Planned at**: commit `430d2f4`, 2026-06-11

## Why this matters

Closed sprints aren't closed everywhere: the nudge mutation never checks
sprint status, so a manager can nudge ICs of a completed sprint (confusing
email, wasted 48h cooldown), and the participant page renders an active nudge
composer for closed sprints. Separately, a young sprint with zero
opportunities renders an awkward blank section on the manager dashboard —
the first thing a brand-new pilot manager sees.

## Current state

- `server/trpc/routers/sprint.ts:123-131` (inside `nudge`): the sprint lookup
  checks id + tenant only:

  ```ts
  const [spr] = await tx
    .select({ id: sprints.id })
    .from(sprints)
    .where(and(eq(sprints.id, input.sprintId), eq(sprints.tenantId, tenantId)));
  if (!spr) throw new TRPCError({ code: "NOT_FOUND" });
  ```

  No `status` condition.
- Participant page `app/(app)/sprint/[id]/participant/[participantId]/page.tsx`
  fetches participant data and always renders `NudgeComposer` (~line 101).
- Dashboard opportunities section `app/(app)/sprint/[id]/page.tsx:190-202`:
  `{opps.map(...)}` with no `opps.length === 0` branch. An empty-state
  pattern exists in `components/report/ReportArticle.tsx` (~line 116-121) and
  the repo's empty-state rule (CLAUDE.md): "Show what would normally be here +
  how to get there."

## Commands you will need

| Purpose     | Command                    | Expected |
|-------------|----------------------------|----------|
| Full gate   | `npm run verify`           | exit 0   |
| Integration | `npm run test:integration` | all pass |

## Scope

**In scope**:
- `server/trpc/routers/sprint.ts` (nudge status guard)
- `app/(app)/sprint/[id]/participant/[participantId]/page.tsx` (closed-sprint
  state)
- `app/(app)/sprint/[id]/page.tsx` (opportunities empty state)
- Tests alongside each

**Out of scope**: broader post-sprint experience (IC/sponsor views of a
finished sprint are functional today via report); nudge worker internals (020).

## Git workflow

- Branch: `fix/024-lifecycle-guards`; conventional commits. No push unless
  asked.

## Steps

### Step 1: Nudge status guard

Add `eq(sprints.status, "active")` to the sprint lookup (or its 020
equivalent). Distinct error: `PRECONDITION_FAILED` with "This sprint is
closed — nudges are off." (NOT_FOUND would gaslight the manager who can see
the sprint).

**Verify**: integration test — nudge on completed sprint → PRECONDITION_FAILED;
active sprint unaffected.

### Step 2: Participant page closed state

Fetch the sprint status on the page (it already loads sprint context — reuse,
don't add a query if avoidable). When not active: render the participant info
read-only and replace NudgeComposer with a quiet note: "This sprint is closed.
Nudges are available on active sprints." Check the back-navigation still
works.

**Verify**: dev pass against a completed seeded sprint (close one via the
existing CloseSprintButton as the manager persona, then visit a participant).

### Step 3: Opportunities empty state

`opps.length === 0` branch: bordered card matching the team-progress visual
language — "No opportunities yet. They surface as your team's sessions add up
— usually from day 7." Keep the existing footnote line below it.

**Verify**: component/page test renders the empty branch; visual check at
375px and 1280px (repo responsive discipline).

## Test plan

- Integration: nudge guard (both statuses).
- Page test for the empty state (model on existing page tests from plan 011,
  e.g. the sprint page test file co-located there).
- Manual closed-sprint walkthrough as manager.

## Done criteria

- [ ] `npm run verify` exits 0
- [ ] Closed sprint: nudge blocked server-side AND not offered in UI
- [ ] Empty opportunities renders the designed state, not a blank gap

## STOP conditions

- `sprints.status` values in the DB differ from `"active"|"completed"`
  (check `db/schema.ts:90+` and seeds first) — align with reality, report if
  ambiguous.

## Maintenance notes

- Any future mutation on sprint children (sessions, captures, invites) should
  copy the status-guard pattern — consider a `requireActiveSprint(tx, id,
  tenantId)` helper if a third site appears.
