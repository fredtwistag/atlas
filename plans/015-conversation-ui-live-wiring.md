# Plan 015: Wire ConversationView to the live engine and retire the scripted mock

> **Executor instructions**: Follow step by step; verify each step. On any STOP
> condition, stop and report. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 430d2f4..HEAD -- components/session/ lib/demo-data.ts app/(app)/session/`
> Plans 013 + 014 MUST be merged first (session.start / session.sendMessage
> mutations must exist). If absent, STOP.

## Status

- **Priority**: P0 — blocks 2026-06-18 pilot launch
- **Effort**: M
- **Risk**: MED — touches the IC's primary surface
- **Depends on**: plans/013, plans/014
- **Category**: direction
- **Planned at**: commit `430d2f4`, 2026-06-11

## Why this matters

After 013/014 the engine exists but ICs still see the scripted mock. This plan
swaps the UI to the live mutations, streams real captures into the side panel,
and deletes the mock so nobody can ship it by accident.

## Current state

- `components/session/ConversationView.tsx` is a client component driven
  entirely by the mock (line 10: `import { conversationScript } from
  "@/lib/demo-data";`). It keeps `messages`, `captures`, `step`, `draft`,
  `thinking`, `done` state and fakes thinking time; `onComplete(sessionId)` is
  a server action passed from `app/(app)/session/[id]/page.tsx:30-34`.
- `lib/demo-data.ts` exists ONLY for this mock (header comment says it should
  "shrink toward deletion as real slices land").
- tRPC client setup: check how client components call mutations today —
  `grep -rn "useMutation\|trpc" components/ --include="*.tsx" | head`. The
  NudgeComposer (`components/.../NudgeComposer.tsx`) is the exemplar for
  client-side mutation + `aria-live` status (plan 007 pattern). Match it. If no
  client tRPC provider exists (server-caller-only architecture), use a server
  action wrapper around the router mutations instead — follow how
  `completeSession` is already passed in as an action.
- A11y conventions from plans 004-007: async status announced via `aria-live`,
  buttons ≥44px (`h-[44px]`), error copy says what happened + what to do.

## Commands you will need

| Purpose   | Command             | Expected |
|-----------|---------------------|----------|
| Gate      | `npm run verify`    | exit 0   |
| Dev       | `npm run dev`       | app on :3000 |
| E2E smoke | `npm run test:e2e`  | all pass (needs seeded dev Supabase) |

## Scope

**In scope**:
- `components/session/ConversationView.tsx` (+ its test)
- `app/(app)/session/[id]/page.tsx` (pass initial messages; keep privacy-gate
  redirect intact — lines 20-23)
- `app/(app)/session/actions.ts` (add `sendMessage` server action wrapper if
  the codebase has no client tRPC provider)
- `lib/demo-data.ts` (DELETE at the end)
- `e2e/smoke.spec.ts` (extend: IC session happy path with mocked LLM or seeded
  reply)

**Out of scope**:
- Engine internals (013/014), opportunity surfaces (016), edit page (017).
- The session checklist in the sidebar — already real.

## Git workflow

- Branch: `feat/015-live-conversation-ui`; conventional commits. No push
  unless asked.

## Steps

### Step 1: Server-load initial state

`app/(app)/session/[id]/page.tsx`: call `api.session.start({ id })` (013) and
pass `initialMessages` to `ConversationView`. Resuming a half-done session must
render prior turns.

**Verify**: `npm run dev` → open a session as IC persona → prior messages render.

### Step 2: Live turn loop

Replace the scripted advance in `ConversationView` with the real call:
on submit → optimistic user bubble → `thinking` state → `sendMessage` → append
assistant reply + any returned captures to the side panel → `aria-live`
announcement ("Reply received", matching the plan-007 pattern). On error:
inline retry affordance with the failed draft preserved; copy per repo style
("Atlas couldn't reply. Your answer is saved here — try again.").

**Verify**: with `ANTHROPIC_API_KEY` set, two different answers produce
different assistant replies; with the key unset, the typed error message
surfaces (no infinite spinner).

### Step 3: Completion

When `done` is returned, show the existing completion state and call the
existing `onComplete` action (which 014 extended). Keep the
`completedRef` guard so completion fires once.

**Verify**: completing flips `/me` checklist state for that session.

### Step 4: Delete the mock

Delete `lib/demo-data.ts`. `grep -rn "demo-data" app components lib services`
→ zero references. Update `ConversationView` tests to mock the action/mutation
layer instead of the script.

**Verify**: `npm run verify` → exit 0. `git grep conversationScript` → empty.

### Step 5: E2E

Extend `e2e/smoke.spec.ts`: IC dev sign-in → privacy ack (if shown) → open
session → send one message → assistant bubble appears. Live-key dependent
assertions must tolerate any text (assert bubble count, not content).

**Verify**: `npm run test:e2e` → pass against seeded dev Supabase.

## Test plan

- Component test: optimistic append, thinking state, error retry path,
  captures panel append, single completion fire. Model on the existing
  `ConversationView` test file (it exists — read it first).
- E2E: the step-5 spec.

## Done criteria

- [ ] `npm run verify` exits 0; `npm run test:e2e` passes
- [ ] `lib/demo-data.ts` deleted; no `conversationScript` references remain
- [ ] Error and empty states match repo copy rules (no "Something went wrong")
- [ ] `aria-live` announcements on send/reply (parity with NudgeComposer)

## STOP conditions

- No client tRPC provider AND server actions can't return streamed/looped state
  cleanly — if the action-wrapper approach forces a full page refresh per turn,
  stop and propose adding the tRPC React provider as its own step.
- Turn latency makes the UI feel broken (>8s p50) — report; do not add fake
  "typing" delays to mask it.

## Maintenance notes

- Plan 017's edit page consumes captures created here.
- If streaming token-by-token is wanted later, it lands in
  `services/llm/client.ts` + this component only.
- Reviewer: check the IC can never see another user's session (ownership is
  enforced server-side in 013's mutations — the UI must not weaken it).
