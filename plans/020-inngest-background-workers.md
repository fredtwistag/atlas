# Plan 020: Inngest foundation — digests, reminders, async extraction, nudge worker

> **Executor instructions**: Follow step by step; verify each step. On any STOP
> condition, stop and report. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 430d2f4..HEAD -- services/ server/trpc/routers/sprint.ts app/api/ package.json`
> Plans 013/014 should ideally be merged (the extraction job consumes them) but
> Steps 1-3 and 5-6 do not depend on them.

## Status

- **Priority**: P0/P1 boundary — the foundation (Steps 1-3) is P0 because the
  CLAUDE.md architecture and three features depend on it; the digest content
  (Step 5) is P1 polish
- **Effort**: M–L
- **Risk**: MED — new vendor (Inngest Cloud) in launch week; operator approved
  this explicitly on 2026-06-11
- **Depends on**: none to start; Step 4 depends on plans/014, Step 6 on
  plans/016
- **Category**: tech-debt / direction
- **Planned at**: commit `430d2f4`, 2026-06-11

## Why this matters

CLAUDE.md promises "Workers: Inngest for scheduled tasks" and `.env.example`
already stubs `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` — but the dependency
was never added. Without background work: weekly sponsor/manager digests don't
exist, idle-IC reminders don't exist, opportunity recompute is manual-only, and
the nudge email send sits inside a tRPC procedure under `withServiceRole`,
which violates the repo's own rule ("Service-role bypass allowed only inside
Inngest workers + audit-logged" — CLAUDE.md, RLS pattern section).

## Current state

- `package.json` — no `inngest` dependency.
- `.env.example` — keys stubbed under "# Inngest (workers)".
- Nudge today: `server/trpc/routers/sprint.ts:99-193` — `managerProcedure` →
  `withServiceRole({ action: "nudge.send", actor }, ...)` → tenant-scoped
  lookups → 48h cooldown via audit log → `sendEmail` inside the transaction
  (comment: a real send failure throws so the transaction rolls back).
- Email layer: `services/email/send.ts` — `sendEmail()` no-ops without
  `RESEND_API_KEY` (returns `{sent:false, skipped:true}`), throws on real
  failure. Templates in `emails/` (`InviteEmail`, `NudgeEmail` — no digest
  template yet).
- Architecture spec for jobs: `docs/02-architecture.md` §8
  (`digest.weekly.sponsor`, `digest.weekly.manager`, `reminder.ic.idle`,
  session-completion processing).
- Deploy target: Vercel + Inngest Cloud (CLAUDE.md deployment line).

## Commands you will need

| Purpose     | Command                          | Expected |
|-------------|----------------------------------|----------|
| Install     | `npm install inngest`            | exit 0   |
| Local dev   | `npx inngest-cli@latest dev`     | dev server connects to `npm run dev` |
| Full gate   | `npm run verify`                 | exit 0   |
| Integration | `npm run test:integration`       | all pass |

## Scope

**In scope**:
- `package.json` (+ `inngest`)
- `services/jobs/client.ts` (Inngest client + typed event map), `services/jobs/functions/*.ts`, tests
- `app/api/inngest/route.ts` (serve handler)
- `server/trpc/routers/sprint.ts` (nudge → enqueue; launch → enqueue invites)
- `emails/DigestEmail.tsx` (+ test) — follow `emails/NudgeEmail.tsx` structure
- `.env.example` (uncomment keys, document)

**Out of scope**:
- The extraction/recompute logic itself (014/016 own it; jobs only invoke).
- Retry/queue UI; Inngest Cloud dashboard is the ops surface.
- GDPR hard-delete job (post-launch; the manual runbook in plan 021 covers
  launch).

## Git workflow

- Branch: `feat/020-inngest-workers`; conventional commits. No push unless
  asked.

## Steps

### Step 1: Client + serve route

`services/jobs/client.ts`: `new Inngest({ id: "atlas" })` with a typed event
map: `session/completed {sessionId, tenantId}`, `sprint/launched {sprintId,
tenantId}`, `nudge/requested {tenantId, sprintId, userId, actorId, subject?,
body}`. `app/api/inngest/route.ts`: `serve()` exporting GET/POST/PUT with all
functions registered.

**Verify**: `npx inngest-cli dev` + `npm run dev` → functions appear in the
local Inngest dashboard.

### Step 2: Nudge worker (fixes the service-role rule violation)

`services/jobs/functions/nudge-send.ts` on `nudge/requested`: move the BODY of
today's nudge transaction (target lookup, sprint check, cooldown check, audit
write, `sendEmail`) here, unchanged in behavior. The tRPC `nudge` mutation
becomes: validate manager role + tenant membership + sprint active (plan 024
adds the status check — coordinate; add it here if 024 hasn't landed) +
rate-limit cap (plan 019) → `inngest.send("nudge/requested")` → return
"queued". UI copy change: NudgeComposer's success message becomes "Nudge on its
way" (it is now async). Audit logging stays exactly as is (worker context IS
the sanctioned place for `withServiceRole` per CLAUDE.md).

**Verify**: integration test on the extracted function (callable directly,
mocked email); local end-to-end — nudge from the UI → job visible in Inngest
dev → email send logged (skipped without key).

### Step 3: Invite sends move post-launch-job

`sprint.launch` currently fires invite emails post-commit via
`Promise.allSettled` (`server/trpc/routers/sprint.ts:309-330`) and failures
vanish. Emit `sprint/launched` instead; `services/jobs/functions/invite-send.ts`
sends each invite as an Inngest step (per-IC step = automatic retry + visible
failure in the dashboard). Keep `generateInviteLink` + `InviteEmail` usage
identical.

**Verify**: launch flow integration test asserts event emitted; manual launch
in dev shows N steps in Inngest dev dashboard.

### Step 4: Session-completion extraction job (needs 014)

On `session/completed`: call 014's `extractFromSession` final pass +
(when 016 lands) `recompute(sprintId)` debounced — use Inngest's built-in
debounce (e.g. 10 min per sprint) so a burst of completions recomputes once.
The session completion path emits the event instead of running the final pass
inline (keep the inline path behind a fallback flag until verified in dev).

**Verify**: complete a session in dev → captures appear; recompute debounce
visible in Inngest dev (two completions → one recompute run).

### Step 5: Scheduled jobs

- `reminder.ic.idle`: daily cron; ICs in active sprints with no completed
  session in 72h AND no reminder in 72h → `NudgeEmail`-based gentle reminder
  (respect plan 025's opt-out flag once it exists; until then send manager-less
  system reminders only to ICs with ≥1 incomplete session). Audit each send.
- `digest.weekly.sponsor` + `digest.weekly.manager`: Monday 07:00 UTC cron;
  per active sprint render `emails/DigestEmail.tsx` — participation %, WAC,
  new opportunities count, top-3 by composite score (data via the same
  aggregation `lib/sprint-read.ts` exposes — reuse `loadSprintProgress`).
  Numbers must match the dashboard exactly (same source functions).

**Verify**: trigger both crons manually from Inngest dev; rendered digest
snapshot test (`emails/DigestEmail.test.tsx` modeled on
`emails/NudgeEmail.test.tsx`).

### Step 6: Nightly recompute (needs 016)

Nightly cron per active sprint → `recompute(sprintId)`. Skip silently when the
LLM key is unset (log count only).

**Verify**: manual trigger in dev with mocked LLM.

## Test plan

- Each function's core body callable + tested directly with mocked email/LLM
  (don't test Inngest's plumbing, test ours).
- `emails/DigestEmail.test.tsx` render test.
- Existing nudge integration tests updated for the enqueue split: tRPC-level
  test asserts event payload; worker-level test asserts the send behavior.

## Done criteria

- [ ] `npm run verify` exits 0
- [ ] `grep -n "withServiceRole" server/trpc/routers/*.ts` → no email-sending
  usage left in tRPC (audit-read usage in twistag.ts may remain)
- [ ] Nudge + invites + reminders + digests all flow through `services/jobs/`
- [ ] All five functions visible and runnable in Inngest local dev
- [ ] DEPLOY runbook note handed to plan 022: Inngest Cloud app creation, env
  keys, Vercel integration (write it into `plans/022`'s checklist file if 022
  already produced `DEPLOY.md` — else leave a `## Handoff` note in this plan's
  PR description)

## STOP conditions

- Inngest Cloud signup/keys unavailable to you — implement + verify against
  `inngest-cli dev` only and flag that prod wiring is pending (022 checklist).
- Moving the nudge send breaks its transactional cooldown guarantee in a way
  the test suite catches — report; the cooldown check and audit write must
  stay atomic (single transaction inside the worker).

## Maintenance notes

- The GDPR hard-delete job (post-launch) and invitation-expiry cleanup
  (plan 025) belong in `services/jobs/functions/` following this structure.
- Inngest event names are now API surface — version them (`session/completed`
  stays stable; breaking payload changes get new event names).
