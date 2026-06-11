# Plan 019: Rate-limit the auth and email surfaces

> **Executor instructions**: Follow step by step; verify each step. On any STOP
> condition, stop and report. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 430d2f4..HEAD -- app/sign-in/ server/trpc/ db/schema.ts`
> On mismatch with the excerpts below, STOP.

## Status

- **Priority**: P0 — public launch exposes these endpoints to the internet
- **Effort**: M
- **Risk**: MED — a too-tight limit locks out a legitimate pilot user; defaults
  below are deliberately generous
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `430d2f4`, 2026-06-11

## Why this matters

Nothing rate-limits anything today. Three concrete exposures at launch:
(1) the OTP verify path can be brute-forced (6-digit code space);
(2) sign-in email sends are unthrottled — an attacker can bomb a victim's
inbox and burn the Resend quota / Supabase auth email quota;
(3) the nudge mutation sends real email on demand (it has a per-recipient 48h
cooldown but no per-actor volume cap). Supabase has some server-side limits,
but they are account-global, opaque, and not something to discover during
launch week.

## Current state

- Sign-in: `app/sign-in/page.tsx` calls `signInWithOtp()` client-side
  (~line 40-59); OTP verification in `app/sign-in/actions.ts`. No throttle
  anywhere.
- tRPC handler `app/api/trpc/[trpc]/route.ts` — plain `fetchRequestHandler`,
  no middleware.
- Nudge: `server/trpc/routers/sprint.ts:99+` (`nudge` mutation) — 48h
  per-recipient cooldown via audit-log lookup, no per-actor cap.
- No Redis/KV in the stack, and adding a vendor for launch week is unjustified
  at pilot scale (1-3 tenants). Postgres is already there: implement a
  fixed-window limiter on a tiny table. The DB pattern to follow:
  `withServiceRole` usage with audit metadata in `server/trpc/routers/sprint.ts`
  (nudge) — but the limiter table is infrastructure, not tenant data: it gets
  NO tenant_id and NO RLS row exposure to clients (service-role access only,
  like `audit_log` writes).

## Commands you will need

| Purpose     | Command                    | Expected |
|-------------|----------------------------|----------|
| Migrate dev | `npm run db:migrate`       | applies 0008 |
| Integration | `npm run test:integration` | all pass |
| Full gate   | `npm run verify`           | exit 0   |

## Scope

**In scope**:
- `db/schema.ts` + `db/migrations/0008_rate_limits.sql` (create
  `rate_limits(key text pk, window_starts_at timestamptz, count int)`)
- `lib/rate-limit.ts` + `lib/rate-limit.test.ts` (create)
- `app/sign-in/actions.ts` / the server path that triggers
  `signInWithOtp` and OTP verify (read first; if `signInWithOtp` is called
  purely client→Supabase, add a thin server action wrapper so the limiter can
  sit in front, and call that from the form instead)
- `server/trpc/routers/sprint.ts` (nudge per-actor cap)
- `db/rate-limits.integration.test.ts` (create)

**Out of scope**:
- Global tRPC per-IP limiting (Vercel WAF / platform configuration — note in
  DEPLOY runbook, plan 022, not app code)
- Conversation turn limits (engine cost controls live in services/llm — P2)

## Git workflow

- Branch: `feat/019-rate-limiting`; conventional commits. No push unless asked.

## Steps

### Step 1: The limiter

`lib/rate-limit.ts`: `async function consume(key: string, opts: { limit:
number; windowSeconds: number }): Promise<{ allowed: boolean; retryAfterSeconds
number }>` — single upsert with window rollover
(`INSERT ... ON CONFLICT (key) DO UPDATE` checking window expiry), via
`withServiceRole` with action `"rate.limit"` BUT with audit logging suppressed
for this action if the audit helper writes a row per call (read
`db/client.ts:91+` first — if every service-role call writes audit_log, add a
documented `skipAudit` flag for this action only; flag it in the PR).
Keys are namespaced strings: `otp-verify:{email}`, `signin-email:{email}`,
`signin-email-ip:{ip}`, `nudge-actor:{userId}`.

**Verify**: `npm test -- lib/rate-limit` (unit, mocked db) +
`db/rate-limits.integration.test.ts` (real upsert semantics, window rollover,
concurrency: two parallel consumes at limit-1 → exactly one allowed).

### Step 2: Sign-in email throttle

Limits: 3 sends / 10 min per email; 10 sends / 10 min per IP
(`request.headers.get("x-forwarded-for")` first hop on Vercel). On block,
return the SAME response shape as success (no enumeration signal) but skip the
send, and show the existing "check your email" UI with a soft note: "If you
requested several codes, wait a few minutes." Keep the existing
no-enumeration behavior intact (read the current `isNoAccountError` handling
in `app/sign-in/page.tsx` before touching anything).

**Verify**: integration/unit test on the wrapper: 4th call within window →
no `sendEmail`/Supabase call; manual dev pass — 4 rapid submits, UI stays calm.

### Step 3: OTP verify throttle

5 attempts / 15 min per email; on block return the standard error copy:
"Too many attempts. Request a new code in a few minutes." Applied in the
server action before calling `supabase.auth.verifyOtp`.

**Verify**: test — 6th verify attempt within window short-circuits without
hitting Supabase.

### Step 4: Nudge actor cap

In the `nudge` mutation, after the existing per-recipient cooldown check: cap
20 nudges / 24h per actor (`nudge-actor:{ctx.session.userId}`). Error copy:
"You've sent a lot of nudges today — Atlas caps these to keep them meaningful.
Try again tomorrow."

**Verify**: integration test with the limiter pre-loaded to the cap → FORBIDDEN.

## Test plan

- `lib/rate-limit.test.ts` — window math, rollover, retryAfter.
- `db/rate-limits.integration.test.ts` — upsert atomicity + parallel consume.
- Router integration — nudge cap; sign-in wrapper tests.

## Done criteria

- [ ] `npm run verify` exits 0
- [ ] All four limits enforced with tests
- [ ] No enumeration regression: blocked sign-in indistinguishable from success
- [ ] `rate_limits` table not readable via tenant context (adversarial check:
  select through `withTenantContext` → error or 0 rows)

## STOP conditions

- The audit helper can't skip per-call logging and would write an audit row per
  rate-limit check (audit table flood) — stop and propose the `skipAudit` flag
  to the operator before proceeding.
- The sign-in flow turns out to call Supabase entirely from the client with no
  server hop possible — report; the fallback is Supabase's own auth rate-limit
  configuration (dashboard) documented in plan 022's runbook.

## Maintenance notes

- At >50 tenants, revisit: move hot keys to Vercel KV/Upstash; the `consume`
  interface is the seam.
- Plan 022's DEPLOY.md should note Vercel's WAF/bot-protection toggles as the
  outer layer; this plan is the application layer.
