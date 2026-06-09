# Supabase schema + RLS foundation (slice 1) — design spec

**Date:** 2026-06-09
**Status:** Approved (design)
**Owner:** fred@twistag.com
**Tickets:** ATL-013 (RLS scaffolding + adversarial harness), ATL-014 (tenants + users + sprints)
**Decisions:** harness + core tables first; adversarial tests on ephemeral local Postgres (chosen 2026-06-09)

---

## 1. Context

The app currently runs on an in-memory data layer (`lib/data.ts`). This slice stands
up the real database foundation per ADR-001 (Row-Level Security on a single schema)
and **proves tenant isolation** with adversarial tests — without yet replacing the
mock data. The UI keeps running unchanged on `lib/data.ts`; swapping it to real
queries via tRPC is a later slice.

The crux: RLS policies use `auth.jwt() ->> 'tenant_id'`. `auth.jwt()` reads the
`request.jwt.claims` session GUC, which Supabase sets automatically for supabase-js
requests. We use **Drizzle over a raw Postgres connection**, so our context layer
sets that GUC itself, per transaction. A small local bootstrap recreates the few
Supabase objects (`anon`/`authenticated`/`service_role` roles + `auth.jwt()`/`auth.uid()`)
so the **identical policy SQL runs on Supabase and on ephemeral local Postgres**.

## 2. Goals

- Drizzle schema + a versioned SQL migration for `tenants` (no RLS), `users`, `sprints`
  (RLS), matching `docs/02-architecture.md §4.1` exactly.
- The RLS context layer: `withTenantContext(claims, fn)` and `withServiceRole(fn)`.
- An adversarial test harness (`asUser`, `seedRow`, `expectIsolated`) running against
  an ephemeral local Postgres, wired into CI as a gate (ADR-001).
- Migration tooling (`npm run db:migrate`) and local DB tooling (`docker-compose`).
- Verified once against the real Supabase dev project.

## 3. Non-goals (next slices)

- Replacing `lib/data.ts` / building tRPC routers.
- Auth provider wiring (magic links, real JWT minting). **Auth provider is TBD,
  leaning Supabase Auth — to be settled in the auth slice as ADR-002** (see §11).
- The remaining ~12 tenant-scoped tables (`sessions`, `messages`, `captures`,
  `opportunities`, `sow_drafts`, `comments`, …) — a mechanical follow-up reusing
  this harness.

## 4. Architecture — RLS with Drizzle

### 4.1 Connection roles
Drizzle connects via `postgres-js` using `DATABASE_URL` as the database owner
(`postgres`). Per request we **drop privileges** to a non-owner role so RLS applies:

- **Tenant context:** open a transaction, then
  ```sql
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"<userId>","tenant_id":"<tenantId>","role":"<role>"}';
  ```
  Run all queries inside the transaction; `SET LOCAL` auto-resets on COMMIT/ROLLBACK.
  Because `authenticated` is not the table owner, RLS is enforced.
- **Service role (bypass):** `SET LOCAL ROLE service_role;` — `service_role` has
  `BYPASSRLS`. Used only for seeding/admin/cross-tenant ops; **every call audit-logged**.

### 4.2 Local portability (`db/bootstrap.sql`)
Idempotent. On a plain local Postgres it creates what Supabase ships:
`anon`, `authenticated`, `service_role` (the last with `BYPASSRLS`); a `auth` schema
with `auth.jwt()` (returns `current_setting('request.jwt.claims', true)::jsonb`) and
`auth.uid()`. Guarded with `IF NOT EXISTS` / `CREATE OR REPLACE` so it's a no-op on
real Supabase. This is what makes the same policies portable.

### 4.3 Client API (`db/client.ts`)
```ts
type TenantClaims = { tenantId: string; userId: string; role: string };

export async function withTenantContext<T>(
  claims: TenantClaims,
  fn: (tx: Drizzle) => Promise<T>,
): Promise<T>;

export async function withServiceRole<T>(
  audit: { action: string; actor: string },
  fn: (tx: Drizzle) => Promise<T>,
): Promise<T>;
```
`withTenantContext` returns typed results from `fn`. `withServiceRole` requires an
`audit` descriptor and writes an `audit_log` row before running `fn` (audit table is
created in this migration since service-role usage starts here).

## 5. Schema (this slice)

Exactly per arch §4.1. `tenants`, `twistag_users`, `audit_log` have **no RLS**
(Twistag-admin / service-role only). `users` and `sprints` are tenant-scoped with RLS.

```sql
-- No RLS
public.tenants(id uuid pk, slug text unique, name text, segment text, status text,
               created_at timestamptz, metadata jsonb)
public.audit_log(id bigserial pk, tenant_id uuid, user_id uuid, action text,
                 target_id text, metadata jsonb, at timestamptz)

-- RLS-enabled (tenant_id uuid NOT NULL REFERENCES tenants, created_at)
public.users(id, tenant_id, email, name, role, department, title, opted_out,
             created_at, UNIQUE(tenant_id, email))
public.sprints(id, tenant_id, name, scope_department, primary_focus, custom_focus,
               start_date, end_date, cadence, status, sponsor_id, manager_id,
               created_at, closed_at)
```

## 6. RLS policies (per tenant-scoped table)

The ADR-001 standard set, plus a Twistag-side read policy:

```sql
ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<t> TO authenticated;

CREATE POLICY "<t>_tenant_select" ON public.<t> FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "<t>_tenant_insert" ON public.<t> FOR INSERT
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "<t>_tenant_update" ON public.<t> FOR UPDATE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "<t>_tenant_delete" ON public.<t> FOR DELETE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Twistag staff read across assigned tenants (claim present ⇒ read)
CREATE POLICY "<t>_twistag_read" ON public.<t> FOR SELECT
  USING ((auth.jwt() ->> 'twistag_role') IS NOT NULL);
```
Indexes: `CREATE INDEX <t>_tenant_idx ON public.<t>(tenant_id);` (tenant_id-first per
standards). Note: the §4.3 Twistag policy also joins `engagement_assignments`; that
table isn't in this slice, so the slice-1 Twistag read is claim-gated and **tightened
to the assignment join when `engagement_assignments` lands**. Flagged in the migration.

## 7. Migration tooling

- `db/migrations/0000_init.sql` — hand-authored (tables + RLS + GRANTs + indexes).
  Versioned and reviewable, since the 2-eng RLS review needs concrete SQL.
- `db/migrate.ts` — runner: loads `.env.local`, applies `bootstrap.sql` then each
  `migrations/*.sql` in order inside a transaction; tracks applied files in a
  `public.schema_migrations` table. `npm run db:migrate`.
- `db/schema.ts` — Drizzle table definitions (typed query surface). Kept in sync with
  the SQL by hand for these 3 tables; `drizzle-kit` can diff later as a check.

## 8. Test strategy (ephemeral local Postgres)

- `docker-compose.yml` — `postgres:16` on `localhost:5433`, db `atlas_test`.
- `vitest.integration.config.ts` — `environment: "node"`, `include: ["**/*.integration.test.ts"]`,
  `globalSetup` that applies bootstrap + migrations to `DATABASE_URL_TEST` once.
- `db/test/helpers.ts`:
  - `asUser({ tenantId, userId?, role? }, fn)` → `withTenantContext` wrapper.
  - `seedRow(table, values)` → insert via `withServiceRole` (bypass) for arranging
    cross-tenant fixtures.
  - `expectIsolated(table)` → asserts a tenant-B user sees 0 tenant-A rows and cannot
    insert/update/delete across tenants.
  - `resetDb()` → truncate between tests.
- Scripts: `test:integration` (vitest integration config). Integration tests **skip**
  when `DATABASE_URL_TEST` is unset, so the existing jsdom `npm test` stays fast and
  secret-free.
- CI: a new `integration` job with a `postgres:16` service, sets `DATABASE_URL_TEST`,
  runs `npm run test:integration`. The existing `verify` job is unchanged.

## 9. Adversarial tests (ADR-001 gate)

`db/users.integration.test.ts` and `db/sprints.integration.test.ts`, each:
- seed a row as tenant A (service role);
- as tenant B: SELECT returns 0 rows; INSERT with tenant_id = A → error/blocked;
  UPDATE/DELETE of A's row affects 0 rows;
- as tenant A: SELECT returns the row (positive control).
`tenants` test: confirm it is **not** RLS-enabled and only reachable via service role.

## 10. File structure

```
db/
  schema.ts                 Drizzle tables (typed query surface)
  client.ts                 withTenantContext / withServiceRole + pool
  migrate.ts                migration runner
  bootstrap.sql             local-only Supabase shim (idempotent)
  migrations/0000_init.sql  tables + RLS + grants + indexes
  test/helpers.ts           asUser / seedRow / expectIsolated / resetDb
  users.integration.test.ts
  sprints.integration.test.ts
docker-compose.yml
vitest.integration.config.ts
```
Continues the single-app-at-root deviation from the `packages/db` monorepo layout in
the standards; promotion to a package is mechanical later.

## 11. Environment & credentials

- `.env.local` (gitignored) holds `DATABASE_URL` (Supabase dev), `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `DATABASE_URL_TEST`
  (local). `.env.example` updated to document them.
- The Supabase **direct** DB host may be disabled (IPv4); use the **Session pooler**
  connection string from the dashboard for `DATABASE_URL` when applying migrations to
  the real project.
- **Auth provider** decision (Stytch vs Supabase Auth) is deferred to the auth slice
  and will be captured as **ADR-002**. Recommendation on record: Supabase Auth for
  Wave 1 (native magic links + custom-claims hook), revisit Stytch at v1.5 (SSO/SCIM).

## 12. Risks & mitigations

- **Owner bypasses RLS** — mitigated: queries run under `SET LOCAL ROLE authenticated`,
  never as owner; adversarial tests would catch a regression.
- **Missing GRANTs** — `authenticated` needs table privileges (RLS filters rows, grants
  gate access). Included in the migration; positive-control test confirms tenant A can read.
- **schema.ts ↔ SQL drift** — only 3 tables; `drizzle-kit` diff as a later check.
- **Local-vs-Supabase divergence** — single policy set + bootstrap shim; the slice is
  verified once against the real project.
- **`request.jwt.claims` typing** — set as a JSON string; `auth.jwt()` casts to jsonb.
  Verified by the positive-control read.

## 13. Success criteria

- `npm run db:migrate` applies cleanly to local Postgres and to the Supabase dev project.
- `npm run test:integration` passes locally and in CI (new job, green).
- Adversarial tests prove isolation on `users` and `sprints`; `tenants` confirmed
  service-role-only.
- No secret committed; `.env.example` documents all vars.
- `lib/data.ts` and the UI are unchanged (no behavioral regression; `npm test`, lint,
  build still green).

## 14. Out of scope / next slices

Auth (ADR-002 + magic links), tRPC routers replacing `lib/data.ts`, the remaining
tenant-scoped tables, Inngest/Resend. Each its own spec → plan cycle, building on this
harness.
