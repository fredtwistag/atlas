# Plan 022: Production cutover — env validation, config parity, DEPLOY runbook

> **Executor instructions**: This plan mixes code (Steps 1-3) with operator
> actions in external dashboards (Step 4 checklist — you WRITE the checklist;
> the operator executes it). Follow step by step; verify each step. On any STOP
> condition, stop and report. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 430d2f4..HEAD -- app/robots.ts app/sitemap.ts app/api/health/ db/client.ts .env.example app/dev/`
> On mismatch with the excerpts below, STOP.

## Status

- **Priority**: P0 — START DAY 1: DNS + Resend domain verification have
  propagation lead times you cannot compress on launch day
- **Effort**: M
- **Risk**: MED — misconfigured prod env fails silently today (that is the
  point of this plan)
- **Depends on**: none. Coordinates with 020 (Inngest keys) and 023 (Sentry
  DSN) — leave checklist slots for both.
- **Category**: dx / security
- **Planned at**: commit `430d2f4`, 2026-06-11

## Why this matters

Current prod posture: a Vercel deployment pointing at the DEV Supabase
project; no prod Supabase, no custom domain, unverified email domain. Multiple
failure modes are SILENT: `sendEmail` no-ops without `RESEND_API_KEY`
(`services/email/send.ts:37-41` logs "[email] skipped" and returns happily) —
in production that means no invites and no way to notice; the magic-link email
needs two manual Supabase dashboard steps that are documented only in
`.env.example:50-53`; `robots.ts`/`sitemap.ts` hardcode
`https://atlas.twistag.com`; the health endpoint reports hardcoded "ok" with
all checks `"not_configured"` (`app/api/health/route.ts:9-19`).

## Current state

- `.env.example:50-53`: "To make it production-ready, in the Supabase
  dashboard: (1) set Resend as the custom SMTP provider, (2) edit the Magic
  Link template to include {{ .Token }} … and bump the OTP/link expiry to 24h."
- `services/email/send.ts:26-28`: `fromAddress()` falls back to
  `"Atlas <onboarding@resend.dev>"` — a sandbox sender that will spam-folder.
- `db/client.ts`: runtime MUST use the transaction pooler (`:6543`,
  `prepare:false`); migrations use `DIRECT_URL` (`:5432`) via
  `db/migrate.ts:56-61` fallback `DIRECT_URL ?? DATABASE_URL`.
- Migrations to apply on prod: `0001`…`0005` exist; the engine track adds
  `0006`-`0008` — the runbook must say "apply ALL of db/migrations in order"
  rather than naming a fixed list. `db/bootstrap.sql` is the
  roles/extension bootstrap — read its header to document when it runs.
- Auth hook: the custom access-token hook must be ENABLED in the Supabase
  dashboard (memory of prior work; verify the hook function name in
  `db/migrations/0001_auth_onboarding.sql` and document it).
- Dev-only surfaces: `/sign-in/dev` is gated
  (`app/sign-in/dev/page.tsx` checks NODE_ENV, and `devSignIn` throws in prod
  — `app/sign-in/actions.ts:12-14`); `app/dev/components/page.tsx` is NOT
  gated.
- No env validation module exists; `process.env.*` is read at point of use.

## Commands you will need

| Purpose   | Command                              | Expected |
|-----------|--------------------------------------|----------|
| Full gate | `npm run verify`                     | exit 0   |
| Health    | `curl -s localhost:3000/api/health`  | JSON with real check fields (after Step 3) |
| Prod build| `NEXT_DIST_DIR=.next-verify npm run build` | exit 0 |

## Scope

**In scope**:
- `lib/env.ts` + `lib/env.test.ts` (create)
- `app/robots.ts`, `app/sitemap.ts` (env-based base URL)
- `app/api/health/route.ts` (real checks)
- `app/dev/components/page.tsx` (prod gate)
- `.env.example` (complete + annotated: required-in-prod vs optional)
- `DEPLOY.md` at repo root — wait: the improve-skill constraint says plans may
  only create files under `plans/`; the runbook content therefore ships as
  PART OF THIS PLAN for the executor to create at `docs/runbooks/deploy.md`
  (executor may create it — the constraint binds the advisor, not you)
- `docs/runbooks/deploy.md` (create, per Step 4)

**Out of scope**:
- Vercel/Supabase/Resend dashboard clicking — operator does it from the
  runbook.
- Inngest + Sentry env wiring details (plans 020/023 own them; leave checklist
  slots).
- Backups/DR doc (P2; Supabase Pro daily backups noted in the runbook's
  one-liner).

## Git workflow

- Branch: `feat/022-prod-cutover`; conventional commits. No push unless asked.

## Steps

### Step 1: `lib/env.ts` — fail loud in prod

Zod schema with two tiers:

- Always required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`.
- Required when `NODE_ENV === "production"`: `RESEND_API_KEY`, `EMAIL_FROM`
  (must NOT contain `resend.dev` — regex refuse), `ANTHROPIC_API_KEY`,
  `APP_URL` (https), `DIRECT_URL`. Refinements: `DATABASE_URL` must contain
  `:6543` in prod (pooler), `DIRECT_URL` must contain `:5432`.

Export `validateEnv()` (throws with ALL failures listed, not first-fail) and
typed `env` getters. Call `validateEnv()` from `db/client.ts`'s
`configureDb` path or `next.config.mjs` at build — choose the earliest point
that runs in every prod boot and document why. Console output must never echo
values — names only.

**Verify**: `lib/env.test.ts` — prod-mode missing key → throws naming it;
`resend.dev` in EMAIL_FROM → throws; dev mode → lenient. Gate green.

### Step 2: Env-based URLs

`app/robots.ts:12` and `app/sitemap.ts:4` hardcode
`https://atlas.twistag.com`. Use `process.env.APP_URL ??
"https://atlas.twistag.com"` via `lib/env.ts`. Also gate
`app/dev/components/page.tsx` with the same `notFound()` pattern as
`app/sign-in/dev/page.tsx:14`.

**Verify**: grep — `grep -rn "atlas.twistag.com" app/ | grep -v env` → only
the fallback in lib/env or zero; dev components page 404s with
`NODE_ENV=production` build.

### Step 3: Real health checks

`app/api/health/route.ts`: replace the stub. Checks with 2s timeouts, each
`"ok" | "error" | "not_configured"`: database (`SELECT 1` via the existing
client), email (`RESEND_API_KEY` present — do NOT send), llm
(`ANTHROPIC_API_KEY` present — do NOT call). Status 200 only if database is
ok; 503 otherwise. No secrets in output. This endpoint becomes the uptime
monitor target (plan 023).

**Verify**: dev run — database "ok"; stop DB access (bogus DATABASE_URL in a
scratch run) → 503.

### Step 4: `docs/runbooks/deploy.md` — the cutover checklist

Ordered, checkbox-style, exact console paths. Sections:

1. **Supabase prod project**: create (EU region — match the privacy policy),
   run `db/bootstrap.sql` per its header, set DB password, capture pooler
   (`:6543`) + direct (`:5432`) URLs.
2. **Migrations**: `DIRECT_URL=... npm run db:migrate` — applies ALL of
   `db/migrations/` in order. NO seed scripts on prod (`db:seed*` are
   dev-only — say so explicitly).
3. **Auth config**: enable the custom access-token hook (name it from
   migration 0001); set Site URL + redirect URLs to the prod domain; SMTP =
   Resend; Magic Link template with `{{ .Token }}`; OTP expiry 24h
   (the `.env.example:50-53` steps, expanded).
4. **Resend**: verify the sending domain (SPF + DKIM records listed), set
   `EMAIL_FROM="Atlas <atlas@…>"`, send a test via
   `npm run email:test` pointed at prod env.
5. **Vercel**: env vars table (every `lib/env.ts` key, which environment,
   where its value comes from); custom domain + HTTPS; slot for
   `INNGEST_*` (plan 020) and `SENTRY_*`/observability (plan 023);
   note Vercel WAF/bot protection toggle (outer rate-limit layer, plan 019).
6. **First-client bootstrap**: how the super admin creates the org + invites
   the first manager (`/admin/clients/new` flow), referencing the invite
   chain.
7. **Go/no-go smoke** (15 min): real magic-link sign-in on prod domain; invite
   round-trip to a real mailbox; IC session turn (real LLM); `/api/health`
   200; `/privacy` renders; one nudge send.
8. **Rollback**: Vercel instant rollback to previous deployment; DB =
   restore-from-backup note (Supabase Pro daily) + "never roll back
   migrations, roll forward".

**Verify**: someone who has never deployed this app can execute it — the
review gate is the operator reading it. Every env var in `lib/env.ts` appears
in §5's table (`grep` each name).

## Test plan

- `lib/env.test.ts` as in Step 1; health-route test with mocked db failure.
- The runbook itself is verified by operator review + the go/no-go smoke on
  launch day.

## Done criteria

- [ ] `npm run verify` exits 0
- [ ] Prod build with a deliberately missing `RESEND_API_KEY` FAILS with a
  clear message (no more silent email no-op in prod)
- [ ] robots/sitemap derive from `APP_URL`
- [ ] `/api/health` reflects real DB state with correct status codes
- [ ] `docs/runbooks/deploy.md` complete; every lib/env key covered
- [ ] `app/dev/components` 404s in prod build

## STOP conditions

- `configureDb`/bootstrapping order makes early `validateEnv()` impossible
  without refactoring the client — report with a proposal rather than moving
  initialization around ad hoc.
- You discover additional silent-fallback env reads beyond the documented ones
  (grep `process.env` repo-wide) — add them to `lib/env.ts` if clear-cut,
  report if ambiguous.

## Maintenance notes

- Every new env var from future plans MUST be added to `lib/env.ts` + the
  runbook table in the same PR — reviewers should reject otherwise.
- After launch, consider IaC for the Supabase config (config-as-code) — P2.
