# Auth + onboarding — super admin → org → manager → members — design spec

**Date:** 2026-06-09
**Status:** Approved (design) — onboarding scope
**Owner:** fred@twistag.com
**Goal flow:** log in as super admin → invite a new organization → log in as that
org's manager → invite members → members log in.
**Decisions:** Supabase Auth (ADR-002); gate the app behind sign-in; dev one-click
sign-in so the whole chain is clickable without email.
**Builds on:** the DB + RLS foundation (`db/`, `withTenantContext`, `auth.jwt()`).

---

## 1. Context & scope

This slice makes auth + multi-tenant onboarding real. It supersedes the earlier
"Part A only" framing — the goal flow needs the Twistag super-admin up front, so
super-admin auth + organization creation + two levels of invitation are all in scope.

The app still renders `lib/data.ts` mock content for the sprint/opportunity pages
(the tRPC data swap is a later slice). What becomes real here: **identity, roles,
tenants, invitations, and gating.**

**ADR-002** (written in this slice): adopt Supabase Auth over Stytch for Wave 1.

## 2. Goals (the clickable chain)

1. **Super admin** (`twistag_admin`) signs in → `/admin`.
2. Super admin **invites an organization**: creates a `tenant` + the org's **manager**
   user + an invitation; surfaces a sign-in link (dev) / sends email (prod).
3. **Manager** signs in → manager home → **invites members** (ICs) for their org.
4. **Members** sign in → IC view.
5. Throughout: routes gated by session; data scoped by `tenant_id` via the claims hook + RLS.

## 3. Non-goals (later slices)

- tRPC routers / replacing `lib/data.ts` (sprint/opportunity pages stay mock).
- `?tenant=` Twistag impersonation-write, cross-tenant cockpit reads beyond what the
  claim-gated `*_twistag_read` policies already allow.
- GDPR endpoints, per-tenant rate limits, Resend SMTP (Supabase built-in email is fine).
- Sprint creation / member→session wiring (separate sprint-setup slice).
- Multi-tenant-same-email + tenant switcher (v2). **Assumption: one app-user per email.**

## 4. Data model additions (migration `0001_auth_onboarding.sql`)

- **`twistag_users`** (no RLS): `id, email UNIQUE, name, role, created_at`.
  `role ∈ {twistag_admin, twistag_lead, twistag_account_manager}`. Seeded super admin.
- **`invitations`** (RLS, tenant-scoped): `id, tenant_id, email, role, status
  (pending|accepted|revoked), invited_by_kind (twistag|user), invited_by_id,
  created_at, accepted_at`. UNIQUE `(tenant_id, email)`. Standard 4 tenant policies +
  `invitations_twistag_read`. Index on `tenant_id`.
- These reuse the slice-1 RLS pattern + adversarial test approach.

## 5. Auth architecture

### 5.1 Supabase clients (`lib/supabase/{server,client,admin}.ts`)
`@supabase/ssr` server + browser clients (cookie sessions); a service-role `admin`
client (server-only) for seeding, invites, and the dev sign-in shortcut.

### 5.2 Custom Access Token Hook (`public.custom_access_token_hook(event jsonb)`)
On token mint, read `event->'claims'->>'email'`:
- If in `twistag_users` → add `twistag_role` (= their role). No `tenant_id` (cross-tenant).
- Else if in `public.users` → add `tenant_id`, `role`, `user_id` (= users.id).
- Else pass through unchanged (→ "no access" state).
Granted to `supabase_auth_admin` only; that role gets `SELECT` on both tables.
`db/bootstrap.sql` gains `supabase_auth_admin` (local shim). Enabling the hook is a
dashboard step (documented).

### 5.3 Session reader (`lib/session.ts`, `lib/auth-claims.ts`)
- `getSession()` → `getUser()` to authenticate, decode the access token, return a
  discriminated result: `{ kind:'twistag', twistagRole, userId } | { kind:'tenant',
  tenantId, role, userId } | null`.
- `getCurrentUser()` → loads the display profile (twistag_users or public.users row).
- `lib/auth-claims.ts#parseClaims(payload)` — pure, unit-tested.

### 5.4 Gating (`middleware.ts`)
Refresh session; then:
- `/admin/**` → require `twistag_role` (else `/sign-in` or 403 page).
- `/me`, `/sprint`, `/twistag`, `/team`, `/dev` → require any session.
- Public: `/`, `/pricing`, `/sign-in`, `/sign-in/dev`, `/auth/**`.

### 5.5 Sign-in surfaces
- `/sign-in` (client) — email → `signInWithOtp` (real magic link).
- `/sign-in/dev` (server, **404 in prod**) — lists **all** identities (super admin +
  every `twistag_users`/`public.users` row, grouped by org); each is a button posting
  to a server action that `admin.generateLink`→`verifyOtp` to set the cookie session.
  This is what makes the whole chain one-click in dev.
- `/auth/callback` — `exchangeCodeForSession`.
- Sign-out server action.

## 6. Onboarding flows

### 6.1 Super admin invites an organization (`/admin`)
- `/admin` (gated to `twistag_role`): table of orgs (tenants) with member counts +
  "Invite organization" button → sheet/form: org `name`, `slug`, `segment`, manager
  `name` + `email`.
- Server action `inviteOrganization`:
  1. `withServiceRole`: insert `tenants` row; insert `public.users` (role=`manager`,
     tenant_id=new) ; insert `invitations` (role=manager, invited_by_kind=twistag,
     status=pending).
  2. `admin.auth.admin.createUser({ email, email_confirm:true })` (idempotent).
  3. Return a sign-in link (dev) shown inline; (prod) `admin.inviteUserByEmail`.
  - Audit-logged.

### 6.2 Manager invites members (`/team`)
- `/team` (gated to role `manager`/`sponsor`): list current org members + pending
  invitations; "Invite members" → form: rows of `email` + `role` (ic/sponsor).
- Server action `inviteMembers` (tenant-scoped via `withTenantContext` for the
  invitation rows; `withServiceRole` for cross-table user + auth creation, audited):
  for each: insert `public.users` (tenant_id = manager's tenant), `invitations`
  (invited_by_kind=user, invited_by_id=manager.user_id), `admin.createUser`.
- A manager can only invite into **their own** tenant (enforced by `getSession()` tenant + RLS).

### 6.3 Member sign-in
Member uses the dev shortcut / magic link → hook resolves email → IC view.

## 7. Error / bad-state (docs/06 §4.3)

- No session on gated route → `/sign-in`. Non-admin on `/admin` → 403 page.
- Signed-in email not in either table → claims lack tenant/twistag → `/sign-in?error=no-access`.
- Manager attempting to invite into another tenant → blocked (tenant from session; RLS on insert).
- Duplicate invite email within a tenant → upsert/ignore (UNIQUE `(tenant_id,email)`).

## 8. Testing

- **Unit:** `parseClaims` (twistag vs tenant vs none); invite input validation (Zod).
- **Integration (embedded-pg):**
  - `custom_access_token_hook`: twistag email → `twistag_role`; tenant email →
    `tenant_id/role/user_id`; unknown → unchanged.
  - `invitations` adversarial isolation (read/insert/update/delete cross-tenant blocked)
    + tenant-A manager cannot insert an invitation tagged tenant B.
- **Proof script** (`db/proof-auth.ts`, real project): generateLink→verifyOtp→decode →
  assert claims, for a super admin and a tenant user.

## 9. Seed (`db/seed-demo.ts`, `npm run db:seed`)

Idempotent, via admin/service role:
- `twistag_users`: super admin `admin@twistag.com` (+ Supabase auth user).
- One demo org (Northwind) + its manager + a couple ICs (so there's something to see
  pre-invite), each with a Supabase auth user. New orgs/members created at runtime via
  the invite flows above.

## 10. File structure

```
middleware.ts
lib/supabase/{server,client,admin}.ts
lib/auth-claims.ts (+ .test.ts)
lib/session.ts                     (rewritten)
lib/invitations.ts                 (Zod input schemas + server-action helpers)
app/(auth)/sign-in/page.tsx        real magic link (client)
app/(auth)/sign-in/dev/page.tsx    one-click persona list (404 in prod)
app/(auth)/sign-in/actions.ts      dev sign-in + sign-out actions
app/auth/callback/route.ts
app/(app)/admin/page.tsx           super-admin: orgs + invite organization
app/(app)/admin/actions.ts         inviteOrganization
app/(app)/team/page.tsx            manager: members + invite members
app/(app)/team/actions.ts          inviteMembers
db/migrations/0001_auth_onboarding.sql   twistag_users, invitations, hook, grants
db/bootstrap.sql                   (+ supabase_auth_admin)
db/seed-demo.ts | db/proof-auth.ts
db/auth-hook.integration.test.ts | db/invitations.integration.test.ts
```

## 11. Dependencies, env, worktree

- Add `@supabase/ssr`, `@supabase/supabase-js`.
- Env already in `.env.local`. Implementation in the `backend-auth` worktree
  (`/Users/fred/Documents/GitHub/atlas-auth`): `npm install` + copy `.env.local`.

## 12. Manual Supabase steps (flagged at run)

1. Auth → URL Configuration → add `http://localhost:3000/auth/callback`.
2. Auth → Hooks → Customize Access Token (JWT) Claims → enable
   `public.custom_access_token_hook`.

## 13. Risks

- **Hook not enabled** → no claims; proof script + a clear "no-access" state surface it.
- **Dev shortcut in prod** → `/sign-in/dev` + its action hard-gate on `NODE_ENV`.
- **`@supabase/ssr` Next 15 cookies** → follow canonical middleware/callback pattern.
- **Scope creep** → sprint creation, member→session wiring, Twistag impersonation-write
  are explicitly out (later slices). This slice = identity + tenancy + invitations + gating.

## 14. Success criteria

- Sign in as super admin → `/admin` → invite an org → a tenant + manager + invitation
  are created and the manager appears in `/sign-in/dev`.
- Sign in as that manager → `/team` → invite members → ICs created + appear in dev list.
- Sign in as a member → IC view. All gated; cross-tenant blocked (adversarial tests).
- Hook + invitations integration tests green; proof script shows real claims.
- `npm test`, `npm run test:integration`, lint, build green. No secret committed.
