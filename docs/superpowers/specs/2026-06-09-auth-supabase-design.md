# Supabase Auth — tenant-user sign-in (auth slice, Part A) — design spec

**Date:** 2026-06-09
**Status:** Approved (design)
**Owner:** fred@twistag.com
**Decisions:** Supabase Auth (ADR-002); gate the app behind sign-in now; Part A
(ic/manager/sponsor) first, Twistag-side is Part B (deferred to its own slice).
**Builds on:** the DB + RLS foundation (`db/`, `withTenantContext`, `auth.jwt()`).

---

## 1. Context

Auth is currently faked: `lib/session.ts` returns a hard-coded demo IC and the app
has no sign-in. This slice makes auth real — **Supabase Auth magic links**, a JWT
that carries `tenant_id`/`role`/`user_id`, route gating, and a `getSession()` that
reads the real session. The UI still renders `lib/data.ts` mock data (the tRPC swap
is a later slice), so after sign-in you see a real session over mock content — the
gate is real even though the data isn't yet.

**ADR-002** (written in this slice) records the decision to use Supabase Auth instead
of Stytch for Wave 1: native magic links, `auth.jwt()` integrates with RLS out of the
box, one fewer vendor/secret. Revisit Stytch only if v1.5 SSO/SCIM demands it.

## 2. Goals

- Magic-link sign-in via `@supabase/ssr` (cookie sessions): `/sign-in`, `/auth/callback`,
  middleware session refresh, sign-out.
- A **Custom Access Token Hook** (Postgres function) that injects `tenant_id`, `role`,
  `user_id` claims by matching the signed-in email to a `public.users` row.
- **Route gating:** `/me`, `/sprint`, `/twistag`, `/dev` require a session; `/`,
  `/pricing`, `/sign-in`, `/auth/*` are public.
- `lib/session.ts` reads real claims (replacing the demo constant).
- A **dev-only one-click sign-in** (persona shortcut) so the gated demo stays usable
  without an email round-trip; production uses real magic-link emails.
- A **demo seed** (`db/seed-demo.ts`): a real Northwind tenant + the demo users in
  `public.users` and Supabase auth, so the gated app is navigable.
- Tests: unit (claims parsing), integration (the hook function), and a proof script
  against the real project.

## 3. Non-goals (later slices)

- Twistag-side auth: `twistag_users`, cross-tenant read, `?tenant=` impersonation
  (Part B — next slice).
- tRPC routers / replacing `lib/data.ts` (data stays mock; gate is real).
- GDPR export/delete endpoints; per-tenant rate limits; email via Resend SMTP
  (Supabase built-in email is fine for now).
- Multi-tenant-same-email + tenant switcher (v2). **Assumption: one app-user per email.**

## 4. Architecture

### 4.1 Supabase clients (`lib/supabase/`)
- `server.ts` — `createServerClient` from `@supabase/ssr`, wired to Next 15 async
  `cookies()`. Used in Server Components, Route Handlers, Server Actions.
- `client.ts` — `createBrowserClient` for the `/sign-in` client component.
- `admin.ts` — a service-role client (no session persistence) for the seed + the
  dev sign-in shortcut + the proof script. **Server-only**; never imported by client code.

### 4.2 Session refresh + gating (`middleware.ts`, repo root)
Standard `@supabase/ssr` middleware: refresh the session cookie on every request, then:
- If the path starts with a protected prefix (`/me`, `/sprint`, `/twistag`, `/dev`)
  and there is no user → redirect to `/sign-in?next=<path>`.
- Public paths pass through. Static assets / `_next` excluded via the matcher.

### 4.3 Custom Access Token Hook (`db/migrations/0001_auth_hook.sql`)
```sql
public.custom_access_token_hook(event jsonb) returns jsonb
```
- Reads the email from `event->'claims'->>'email'`.
- `SELECT id, tenant_id, role FROM public.users WHERE email = <email> LIMIT 1`.
- If found, merges `tenant_id`, `role`, `user_id` (= `public.users.id`) into
  `event->'claims'` and returns the event; else returns it unchanged.
- Grants: `EXECUTE` to `supabase_auth_admin` only (revoked from `authenticated`,
  `anon`, `public`); `supabase_auth_admin` gets `SELECT` on `public.users`.
- `db/bootstrap.sql` gains the `supabase_auth_admin` role (local shim) so the same
  migration applies locally and on Supabase.
- **Enabling** the hook is a Supabase dashboard step (Auth → Hooks → Customize Access
  Token (JWT) Claims → select `public.custom_access_token_hook`). Documented; the
  user performs it (like the pooler URL).

### 4.4 Session reader (`lib/session.ts`)
- `getSession()` → uses the server client: `getUser()` to authenticate, then reads
  the custom claims from the verified access token (`tenant_id`, `role`, `user_id`).
  Returns `{ userId, tenantId, role } | null`.
- `getCurrentUser()` → from the claims, loads the full `User` row via
  `withTenantContext({tenantId,userId,role}, …)` (the user can read their own tenant's
  rows under RLS). Returns the `User` shape `lib/types.ts` already defines.
- Both are server-only. After gating, callers can assume a session, but null is
  handled defensively (redirect to `/sign-in`).
- `lib/auth-claims.ts` — a tiny pure `parseClaims(payload)` helper (unit-tested) that
  pulls `tenant_id`/`role`/`user_id` from a decoded JWT payload.

### 4.5 Sign-in surfaces
- `/sign-in` (client) — email field → `supabase.auth.signInWithOtp({ email, options:{
  emailRedirectTo: <origin>/auth/callback }})` → "check your email" state.
- `/sign-in/dev` (server component) — **404 in production** (`notFound()` when
  `process.env.NODE_ENV === 'production'`). Lists demo personas; each is a form posting
  to a Server Action that, via the admin client, `generateLink({type:'magiclink',email})`
  then `verifyOtp({type:'magiclink', token_hash, email})` on the server client to set
  the session cookie, then redirects to `next` (no email needed).
- `/auth/callback` (route handler) — `exchangeCodeForSession(code)`, redirect to `next` or `/me`.
- Sign-out — Server Action `supabase.auth.signOut()` → redirect `/`.

### 4.6 Demo seed (`db/seed-demo.ts`, `npm run db:seed`)
Idempotent. Via the admin/service-role client:
- Upsert a `tenants` row (Northwind) + the demo `public.users` (Priya, Marcus, Dana…)
  with stable UUIDs, using `withServiceRole`.
- For each, `admin.auth.admin.createUser({ email, email_confirm:true })` (ignore
  "already exists"). So personas can sign in. The DB `users.id` and the Supabase
  `auth.users.id` are **independent**; linkage is by email (the hook resolves it).

## 5. Data flow (sign-in → RLS)

1. User requests `/sign-in/dev` (dev) or `/sign-in` (prod), authenticates.
2. Supabase mints the access token; the **hook** adds `tenant_id`/`role`/`user_id`.
3. The session cookie is set; middleware refreshes it per request.
4. `getCurrentUser()` reads claims → `withTenantContext(claims, …)` sets
   `request.jwt.claims` → RLS scopes queries (today only the seed/proof exercise real
   queries; pages still read `lib/data.ts`).

## 6. Error handling / bad-state (per docs/06 §4.3)

- No session on a protected route → redirect `/sign-in`.
- Signed-in email with **no** `public.users` match → claims lack `tenant_id`;
  `getCurrentUser()` returns null → redirect to a `/sign-in?error=no-access` state
  ("your account isn't part of a workspace yet"). No tenant leakage.
- Malformed/expired token → `getUser()` fails → treated as no session.

## 7. Testing

- **Unit:** `lib/auth-claims.test.ts` — `parseClaims` extracts/validates claims;
  rejects missing `tenant_id`.
- **Integration** (embedded-pg, `db/auth-hook.integration.test.ts`): seed a
  `public.users` row, call `SELECT public.custom_access_token_hook(<event>)`, assert
  the returned claims contain the right `tenant_id`/`role`/`user_id`; and that an
  unknown email passes through unchanged.
- **Proof script** (`db/proof-auth.ts`, manual `npm run db:proof:auth`): against the
  real project — admin `generateLink` for a seeded demo email, `verifyOtp`, decode the
  access token, assert `tenant_id`/`role` present. Proves the hook end-to-end (after
  the user enables it in the dashboard).

## 8. File structure

```
middleware.ts                         session refresh + route gating
lib/supabase/server.ts | client.ts | admin.ts
lib/auth-claims.ts (+ .test.ts)
lib/session.ts                        (rewritten: real claims)
app/(auth)/sign-in/page.tsx           real magic-link form (client)
app/(auth)/sign-in/dev/page.tsx       dev persona shortcut (404 in prod)
app/(auth)/sign-in/actions.ts         server actions (dev sign-in, sign-out)
app/auth/callback/route.ts            code exchange
db/migrations/0001_auth_hook.sql      custom_access_token_hook + grants
db/bootstrap.sql                      (+ supabase_auth_admin role)
db/seed-demo.ts                       npm run db:seed
db/proof-auth.ts                      npm run db:proof:auth
db/auth-hook.integration.test.ts
```

## 9. Dependencies & env

- Add `@supabase/ssr`, `@supabase/supabase-js`.
- Env (already in `.env.local`): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`.
- Worktree note: implementation happens in the `backend-auth` git worktree
  (`/Users/fred/Documents/GitHub/atlas-auth`); needs `npm install` + a copy of
  `.env.local` there.

## 10. Manual Supabase steps (flagged at the run step)

1. Auth → URL Configuration → add redirect URL `http://localhost:3000/auth/callback`.
2. Auth → Hooks → "Customize Access Token (JWT) Claims" → enable
   `public.custom_access_token_hook`.

## 11. Risks & mitigations

- **Hook not enabled** → tokens lack `tenant_id`; proof script + a clear runtime
  "no-access" state surface it. Documented as a required manual step.
- **`@supabase/ssr` cookie wiring in Next 15** (async `cookies()`) — follow the current
  SSR pattern; the `/auth/callback` + middleware are the canonical touchpoints.
- **Dev shortcut leaking to prod** → `/sign-in/dev` hard-returns `notFound()` when
  `NODE_ENV==='production'`; the action checks the same.
- **Gating breaks the demo** → mitigated by the dev one-click persona sign-in.
- **`auth.users` vs `public.users` divergence** → linkage strictly by email; seed
  creates both; hook resolves email→tenant.

## 12. Success criteria

- Magic-link sign-in works in dev (real flow) and the dev shortcut signs in instantly.
- After sign-in, `getCurrentUser()` returns the real persona; middleware blocks
  unauthenticated access to protected routes.
- Hook integration test green; `npm run db:proof:auth` shows real `tenant_id`/`role`
  claims on the live project.
- `npm test`, `npm run test:integration`, lint, build all green.
- No demo fallback remains in `lib/session.ts`; no secret committed.

## 13. Out of scope / next

Part B (Twistag-side auth + tenant switching), tRPC data layer, GDPR endpoints.
