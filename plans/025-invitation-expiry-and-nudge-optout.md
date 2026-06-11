# Plan 025: Invitation expiry + nudge opt-out preference

> **Executor instructions**: Follow step by step; verify each step. On any STOP
> condition, stop and report. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 430d2f4..HEAD -- db/schema.ts db/migrations/ lib/invitation-accept.ts server/trpc/routers/sprint.ts "app/(app)/me/"`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW–MED (touches the invite acceptance path — the onboarding
  artery; tests required before merge)
- **Depends on**: plans/020 (the cleanup job rides Inngest; if 020 is delayed,
  ship without the cron — expiry is enforced at acceptance time anyway)
- **Category**: security / compliance
- **Planned at**: commit `430d2f4`, 2026-06-11

## Why this matters

Invitations are single-use but immortal: the `invitations` table
(`db/schema.ts:49-67`) has `status` and `acceptedAt` but no `expires_at` — a
leaked invite link works weeks later, including for members the manager has
since removed and re-invited. And ICs cannot object to nudges: GDPR Art. 21
gives employees an objection right, and there is no preference flag — a
manager can keep nudging someone who has asked them (verbally) to stop, with
Atlas as the delivery mechanism.

## Current state

- Schema excerpt (`db/schema.ts:49-65`): columns id, tenantId, email, role,
  status (default "pending"), invitedByKind, invitedById, createdAt,
  acceptedAt. No expiry.
- Acceptance: `lib/invitation-accept.ts` (`markInvitationAccepted`, called
  non-fatally from `app/auth/callback/route.ts:40`).
- Re-invite/resend/cancel flows exist in member management (manager-sponsor
  experience v2 work) — find them via
  `grep -rn "invitation" server/trpc/routers/*.ts components/team/ | head`
  and read before changing semantics.
- Nudge: per-recipient 48h cooldown + (post-019) actor cap + (post-020)
  worker; no recipient preference. `users` table (`db/schema.ts:69+`) has no
  preferences column.
- IC settings surface: `/me` page — there is no settings page; the toggle
  lives on `/me` (smallest honest surface).

## Commands you will need

| Purpose     | Command                    | Expected |
|-------------|----------------------------|----------|
| Migrate dev | `npm run db:migrate`       | applies 0009 |
| Full gate   | `npm run verify`           | exit 0   |

## Scope

**In scope**:
- `db/schema.ts` + `db/migrations/0009_invite_expiry_and_prefs.sql`
  (invitations.expires_at; users.allow_nudges boolean default true)
- `lib/invitation-accept.ts` (+ acceptance-time expiry check; expired →
  treated as not-found with friendly copy at the callback layer)
- Invite creation sites (launch flow + member-add + resend — set
  `expires_at = now() + 14 days`; RESEND refreshes it)
- Nudge path (`sprint.ts` mutation or 020 worker): skip + explain when
  `allow_nudges = false`
- `app/(app)/me/page.tsx` (+ small toggle, server action)
- `db/invitations.integration.test.ts` (extend), nudge tests (extend)
- System idle reminders (plan 020 Step 5) must also respect `allow_nudges`

**Out of scope**: full notification-preferences center; email unsubscribe
links for transactional invites (they are one-shot operational emails).

## Git workflow

- Branch: `feat/025-invite-expiry-optout`; conventional commits. No push
  unless asked.

## Steps

### Step 1: Migration 0009

`expires_at timestamptz` on invitations (backfill existing pending rows to
`created_at + 14 days`); `allow_nudges boolean not null default true` on
users. Standard migration file pattern (0004 is the exemplar). No RLS policy
changes — both ride existing table policies.

**Verify**: `npm run db:migrate` exit 0; integration suite green.

### Step 2: Enforce at acceptance

In `markInvitationAccepted` (and any direct acceptance query): pending +
`expires_at > now()` required; expired → return a distinct result so
`app/auth/callback/route.ts` can land the user on `/sign-in` with copy:
"That invitation has expired. Ask your manager to resend it." Set
`expires_at` at every creation site; resend refreshes both `status` and
`expires_at`.

**Verify**: integration tests — expired invite cannot be accepted; resend
revives; fresh invite unaffected.

### Step 3: Nudge opt-out

Nudge send path: if target `allow_nudges = false`, return/record
"skipped — recipient opted out" (manager sees honest copy: "Priya has turned
off nudges."). `/me` toggle ("Allow nudges from your manager") via server
action, `aria-live` confirmation, default on.

**Verify**: integration test both flag states; manual toggle round-trip in
dev.

### Step 4: Cleanup cron (skip if 020 absent)

Inngest daily job: delete pending invitations expired >30 days (audit-log the
count). Keep accepted rows forever (provenance).

**Verify**: function test with seeded expired rows.

## Test plan

- Invitations: expired/valid/resend matrix (extend
  `db/invitations.integration.test.ts`).
- Nudge: opt-out respected in mutation/worker + reminder job.
- `/me` toggle component test.

## Done criteria

- [ ] `npm run verify` exits 0
- [ ] Expired invitation rejected with the friendly copy path
- [ ] Every invite-creation site sets expiry (grep the insert sites and list
  them in the PR)
- [ ] Opt-out respected by manager nudges AND system reminders

## STOP conditions

- The acceptance path turns out to be load-bearing for the auth callback in a
  way that makes the expiry check break sign-in for EXISTING accepted users —
  the check must apply to pending invitations only; if the code path can't
  distinguish, stop and report.

## Maintenance notes

- v1.5 Slack channel must honor `allow_nudges` as the same single source.
- If invites later carry tokens in-app (vs Supabase magic links), expiry moves
  to the token layer — keep the column authoritative.
