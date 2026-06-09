# Supabase schema + RLS foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the real Postgres foundation (Drizzle schema + RLS for `tenants`/`users`/`sprints`), a tenant-context connection layer, and an adversarial test harness that proves tenant isolation — without replacing the in-memory `lib/data.ts`.

**Architecture:** Drizzle over `postgres-js`. Tenant queries run inside a transaction that does `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', …, true)`, so `auth.jwt()` resolves and RLS is enforced. A local `bootstrap.sql` recreates the Supabase roles + `auth.jwt()` shim so the *same* policy SQL runs on Supabase and on a local ephemeral Postgres. Adversarial tests run against an **`embedded-postgres`** instance (no Docker on this machine) booted in Vitest globalSetup.

**Tech Stack:** drizzle-orm 0.45, postgres 3.4 (postgres-js), drizzle-kit 0.31, tsx 4.22, dotenv 17.4, embedded-postgres (test only), Vitest 4.

**Branch:** `backend-db-rls` (already created off `main`). Spec: `docs/superpowers/specs/2026-06-09-supabase-rls-foundation-design.md`.

**Deviation from spec §8:** Docker is unavailable, so the ephemeral test Postgres is `embedded-postgres` (a downloaded PG binary run in-process) rather than docker-compose / a CI service container. The test code reads `DATABASE_URL_TEST`; globalSetup boots embedded-pg unless that URL is already provided, so a system Postgres also works.

**Conventions:** strict TS, explicit return types on exports, no barrel files, co-located tests, `@/` alias. Each task ends green (`npm run typecheck`, and for test tasks `npm run test:integration`).

---

## File map

**New**
- `db/schema.ts` — Drizzle tables (typed query surface)
- `db/client.ts` — pool + `withTenantContext` / `withServiceRole`
- `db/bootstrap.sql` — local-only roles + `auth.jwt()`/`auth.uid()` shim
- `db/migrations/0000_init.sql` — tables + RLS + grants + indexes
- `db/migrate.ts` — migration runner (`runMigrations`)
- `db/test/globalSetup.ts` — boots embedded-pg, applies bootstrap + migrations
- `db/test/helpers.ts` — `asUser`, `seedRow`, `expectIsolated`, `resetDb`, `TENANT_A`, `TENANT_B`
- `db/users.integration.test.ts`, `db/sprints.integration.test.ts`, `db/tenants.integration.test.ts`
- `vitest.integration.config.ts`
- `drizzle.config.ts` (for drizzle-kit diffing, optional use)

**Modified**
- `package.json` (deps + scripts), `.env.example`, `.github/workflows/ci.yml`, `README.md`

---

### Task 1: DB dependencies + scripts

**Files:** Modify `package.json`

- [ ] **Step 1: Install runtime + tooling deps**

Run:
```bash
npm install drizzle-orm@^0.45.2 postgres@^3.4.9 dotenv@^17.4.2
npm install -D drizzle-kit@^0.31.10 tsx@^4.22.4 embedded-postgres
```

- [ ] **Step 2: Add scripts to `package.json`**

In `"scripts"`, add:
```json
"db:migrate": "tsx db/migrate.ts",
"test:integration": "vitest run --config vitest.integration.config.ts"
```

- [ ] **Step 3: Verify install + typecheck still green**

Run: `npm run typecheck`
Expected: passes (no usages yet).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add drizzle, postgres-js, embedded-postgres, db scripts"
```

---

### Task 2: Drizzle schema

**Files:** Create `db/schema.ts`

- [ ] **Step 1: Write `db/schema.ts`** (matches arch §4.1 for the three tables + audit_log)

```ts
import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  date,
  bigserial,
  unique,
} from "drizzle-orm/pg-core";

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  segment: text("segment").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb("metadata").default({}),
});

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  tenantId: uuid("tenant_id"),
  userId: uuid("user_id"),
  action: text("action").notNull(),
  targetId: text("target_id"),
  metadata: jsonb("metadata").default({}),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull(),
    department: text("department"),
    title: text("title"),
    optedOut: boolean("opted_out").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uniqEmail: unique().on(t.tenantId, t.email) }),
);

export const sprints = pgTable("sprints", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(),
  scopeDepartment: text("scope_department"),
  primaryFocus: text("primary_focus").notNull(),
  customFocus: text("custom_focus"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  cadence: text("cadence").notNull(),
  status: text("status").notNull(),
  sponsorId: uuid("sponsor_id").references(() => users.id),
  managerId: uuid("manager_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add db/schema.ts
git commit -m "feat(db): drizzle schema for tenants, users, sprints, audit_log"
```

---

### Task 3: Local bootstrap SQL (Supabase shim)

**Files:** Create `db/bootstrap.sql`

- [ ] **Step 1: Write `db/bootstrap.sql`** — idempotent; LOCAL/TEST ONLY (never applied to real Supabase, which already has these)

```sql
-- Recreate the minimal Supabase objects so the same RLS policies run locally.
-- Idempotent. NOT applied against the real Supabase project.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$$;

-- Allow the connecting (owner) role to SET ROLE into these roles.
GRANT anon, authenticated, service_role TO CURRENT_USER;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
  LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb
$$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE
AS $$
  SELECT nullif(
    (coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb) ->> 'sub',
    ''
  )::uuid
$$;

GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
```

- [ ] **Step 2: Commit**

```bash
git add db/bootstrap.sql
git commit -m "feat(db): local bootstrap shim for Supabase roles + auth.jwt()"
```

---

### Task 4: Initial migration (tables + RLS + grants + indexes)

**Files:** Create `db/migrations/0000_init.sql`

- [ ] **Step 1: Write `db/migrations/0000_init.sql`**

```sql
-- ============ NO-RLS tables (Twistag-admin / service-role only) ============
CREATE TABLE IF NOT EXISTS public.tenants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text UNIQUE NOT NULL,
  name       text NOT NULL,
  segment    text NOT NULL,
  status     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata   jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id         bigserial PRIMARY KEY,
  tenant_id  uuid,
  user_id    uuid,
  action     text NOT NULL,
  target_id  text,
  metadata   jsonb DEFAULT '{}'::jsonb,
  at         timestamptz NOT NULL DEFAULT now()
);

-- ============ TENANT-SCOPED tables (RLS) ============
CREATE TABLE IF NOT EXISTS public.users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id),
  email      text NOT NULL,
  name       text NOT NULL,
  role       text NOT NULL,
  department text,
  title      text,
  opted_out  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS public.sprints (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id),
  name             text NOT NULL,
  scope_department text,
  primary_focus    text NOT NULL,
  custom_focus     text,
  start_date       date NOT NULL,
  end_date         date NOT NULL,
  cadence          text NOT NULL,
  status           text NOT NULL,
  sponsor_id       uuid REFERENCES public.users(id),
  manager_id       uuid REFERENCES public.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz
);

CREATE INDEX IF NOT EXISTS users_tenant_idx ON public.users(tenant_id);
CREATE INDEX IF NOT EXISTS sprints_tenant_idx ON public.sprints(tenant_id);

-- ============ GRANTS ============
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sprints TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ============ RLS: users ============
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_tenant_select" ON public.users FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "users_tenant_insert" ON public.users FOR INSERT
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "users_tenant_update" ON public.users FOR UPDATE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "users_tenant_delete" ON public.users FOR DELETE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "users_twistag_read" ON public.users FOR SELECT
  USING ((auth.jwt() ->> 'twistag_role') IS NOT NULL);

-- ============ RLS: sprints ============
ALTER TABLE public.sprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sprints_tenant_select" ON public.sprints FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "sprints_tenant_insert" ON public.sprints FOR INSERT
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "sprints_tenant_update" ON public.sprints FOR UPDATE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "sprints_tenant_delete" ON public.sprints FOR DELETE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "sprints_twistag_read" ON public.sprints FOR SELECT
  USING ((auth.jwt() ->> 'twistag_role') IS NOT NULL);

-- NOTE: the *_twistag_read policies are claim-gated only in slice 1. When
-- engagement_assignments lands, tighten them to the assignment join (arch §4.3).
```

- [ ] **Step 2: Commit**

```bash
git add db/migrations/0000_init.sql
git commit -m "feat(db): initial migration — tables, RLS policies, grants, indexes"
```

---

### Task 5: Migration runner

**Files:** Create `db/migrate.ts`

- [ ] **Step 1: Write `db/migrate.ts`**

```ts
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));

export async function runMigrations(
  databaseUrl: string,
  opts: { withBootstrap: boolean },
): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    if (opts.withBootstrap) {
      const bootstrap = readFileSync(join(here, "bootstrap.sql"), "utf8");
      await sql.unsafe(bootstrap);
    }

    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const dir = join(here, "migrations");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const already = await sql`
        SELECT 1 FROM public.schema_migrations WHERE filename = ${file}
      `;
      if (already.length > 0) continue;
      const content = readFileSync(join(dir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`INSERT INTO public.schema_migrations (filename) VALUES (${file})`;
      });
      // eslint-disable-next-line no-console
      console.log(`applied ${file}`);
    }
  } finally {
    await sql.end();
  }
}

// CLI entry: real project, no bootstrap.
const isCli = process.argv[1] === fileURLToPath(import.meta.url);
if (isCli) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set (load it from .env.local)");
  }
  runMigrations(url, { withBootstrap: false })
    .then(() => {
      // eslint-disable-next-line no-console
      console.log("migrations complete");
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
```

- [ ] **Step 2: Make the CLI load `.env.local`**

The script uses `process.env.DATABASE_URL`. Run it with dotenv preloaded by updating the script in `package.json`:
```json
"db:migrate": "tsx --env-file=.env.local db/migrate.ts"
```
(`tsx`/Node 22 supports `--env-file`.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add db/migrate.ts package.json
git commit -m "feat(db): ordered SQL migration runner with schema_migrations"
```

---

### Task 6: Tenant-context client

**Files:** Create `db/client.ts`

- [ ] **Step 1: Write `db/client.ts`**

```ts
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
export type TenantClaims = { tenantId: string; userId: string; role: string };

function connectionUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

// Lazily create one pool per process.
let _client: ReturnType<typeof postgres> | null = null;
let _db: Db | null = null;

function db(): Db {
  if (!_db) {
    _client = postgres(connectionUrl(), { max: 10, onnotice: () => {} });
    _db = drizzle(_client, { schema });
  }
  return _db;
}

/** For tests that boot embedded-pg after import: override the pool URL. */
export function configureDb(url: string): void {
  _client?.end();
  _client = postgres(url, { max: 5, onnotice: () => {} });
  _db = drizzle(_client, { schema });
}

/**
 * Run `fn` as the `authenticated` role with the given JWT claims set, so RLS
 * policies (auth.jwt() ->> 'tenant_id') apply. Everything runs in one
 * transaction; SET LOCAL resets on commit/rollback.
 */
export async function withTenantContext<T>(
  claims: TenantClaims,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  const claimsJson = JSON.stringify({
    sub: claims.userId,
    tenant_id: claims.tenantId,
    role: claims.role,
  });
  return db().transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE authenticated`);
    await tx.execute(sql`SELECT set_config('request.jwt.claims', ${claimsJson}, true)`);
    return fn(tx as unknown as Db);
  });
}

/**
 * Run `fn` as the service_role (BYPASSRLS). For seeding, admin, and cross-tenant
 * operations only. Writes an audit_log row before running fn.
 */
export async function withServiceRole<T>(
  audit: { action: string; actor: string },
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE service_role`);
    await tx.execute(
      sql`INSERT INTO public.audit_log (action, metadata)
          VALUES (${audit.action}, jsonb_build_object('actor', ${audit.actor}::text))`,
    );
    return fn(tx as unknown as Db);
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add db/client.ts
git commit -m "feat(db): tenant-context + service-role connection layer"
```

---

### Task 7: Embedded-Postgres test harness boot

**Files:** Create `vitest.integration.config.ts`, `db/test/globalSetup.ts`

- [ ] **Step 1: Write `vitest.integration.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

const TEST_DB_URL =
  process.env.DATABASE_URL_TEST ??
  "postgresql://postgres:postgres@localhost:5433/atlas_test";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.integration.test.ts"],
    globalSetup: ["./db/test/globalSetup.ts"],
    env: { DATABASE_URL: TEST_DB_URL, DATABASE_URL_TEST: TEST_DB_URL },
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
```

- [ ] **Step 2: Write `db/test/globalSetup.ts`**

```ts
import EmbeddedPostgres from "embedded-postgres";
import { rmSync } from "node:fs";
import { runMigrations } from "../migrate";

const PORT = 5433;
const DATA_DIR = "./.pgdata-test";
const TEST_URL = `postgresql://postgres:postgres@localhost:${PORT}/atlas_test`;

export default async function setup(): Promise<() => Promise<void>> {
  // If an external test DB is provided, use it as-is.
  if (process.env.DATABASE_URL_TEST) {
    await runMigrations(process.env.DATABASE_URL_TEST, { withBootstrap: true });
    return async () => {};
  }

  rmSync(DATA_DIR, { recursive: true, force: true });
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: false,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("atlas_test");

  await runMigrations(TEST_URL, { withBootstrap: true });
  process.env.DATABASE_URL = TEST_URL;
  process.env.DATABASE_URL_TEST = TEST_URL;

  return async () => {
    await pg.stop();
    rmSync(DATA_DIR, { recursive: true, force: true });
  };
}
```

- [ ] **Step 3: Add `.pgdata-test` to `.gitignore`**

Append to `.gitignore`:
```
# embedded-postgres test data
.pgdata-test
```

- [ ] **Step 4: Smoke-verify embedded-pg boots + migrations apply**

Create a throwaway `db/_smoke.integration.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { withServiceRole } from "./client";
import { sql } from "drizzle-orm";

describe("db smoke", () => {
  it("has the users table after migration", async () => {
    const rows = await withServiceRole({ action: "smoke", actor: "test" }, (tx) =>
      tx.execute(sql`SELECT to_regclass('public.users') AS t`),
    );
    expect(rows[0].t).toBe("users");
  });
});
```
Run: `npm run test:integration`
Expected: PASS. (This proves embedded-pg boots, bootstrap + migration ran, and the service-role path works.) If `embedded-postgres` fails to boot on this platform, set `DATABASE_URL_TEST` to a reachable Postgres and re-run; globalSetup will use it instead.

- [ ] **Step 5: Delete the smoke test, commit the harness**

```bash
rm db/_smoke.integration.test.ts
git add vitest.integration.config.ts db/test/globalSetup.ts .gitignore
git commit -m "test(db): embedded-postgres harness + integration vitest config"
```

---

### Task 8: Test helpers

**Files:** Create `db/test/helpers.ts`

- [ ] **Step 1: Write `db/test/helpers.ts`**

```ts
import { expect } from "vitest";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { withTenantContext, withServiceRole, type Db } from "../client";
import { tenants } from "../schema";

export const TENANT_A = "00000000-0000-0000-0000-00000000000a";
export const TENANT_B = "00000000-0000-0000-0000-00000000000b";
export const USER_A = "00000000-0000-0000-0000-0000000000a1";
export const USER_B = "00000000-0000-0000-0000-0000000000b1";

/** Run as a tenant user (authenticated role + claims). */
export function asUser<T>(
  ctx: { tenantId: string; userId?: string; role?: string },
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  return withTenantContext(
    {
      tenantId: ctx.tenantId,
      userId: ctx.userId ?? USER_A,
      role: ctx.role ?? "ic",
    },
    fn,
  );
}

/** Insert via service role (bypasses RLS) for arranging fixtures. */
export function seedRow(
  fn: (tx: Db) => Promise<unknown>,
): Promise<unknown> {
  return withServiceRole({ action: "test.seed", actor: "test" }, fn);
}

/** Truncate tenant-scoped tables + tenants between tests (service role). */
export async function resetDb(): Promise<void> {
  await withServiceRole({ action: "test.reset", actor: "test" }, (tx) =>
    tx.execute(
      sql`TRUNCATE public.sprints, public.users, public.tenants RESTART IDENTITY CASCADE`,
    ),
  );
}

/** Seed the two baseline tenants. */
export async function seedTenants(): Promise<void> {
  await seedRow((tx) =>
    tx.insert(tenants).values([
      { id: TENANT_A, slug: "tenant-a", name: "Tenant A", segment: "test", status: "active" },
      { id: TENANT_B, slug: "tenant-b", name: "Tenant B", segment: "test", status: "active" },
    ]),
  );
}

/** Convenience re-exports for tests. */
export { eq, sql };
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add db/test/helpers.ts
git commit -m "test(db): asUser/seedRow/resetDb/seedTenants helpers + tenant ids"
```

---

### Task 9: Adversarial tests — users

**Files:** Create `db/users.integration.test.ts`

- [ ] **Step 1: Write `db/users.integration.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { users } from "./schema";
import {
  asUser,
  seedRow,
  resetDb,
  seedTenants,
  TENANT_A,
  TENANT_B,
} from "./test/helpers";

beforeEach(async () => {
  await resetDb();
  await seedTenants();
  // A user owned by tenant A.
  await seedRow((tx) =>
    tx.insert(users).values({
      tenantId: TENANT_A,
      email: "secret@a.example",
      name: "Secret A",
      role: "ic",
    }),
  );
});

describe("users — tenant isolation", () => {
  it("tenant A can read its own user (positive control)", async () => {
    const rows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(users),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("secret@a.example");
  });

  it("tenant B cannot read tenant A users", async () => {
    const rows = await asUser({ tenantId: TENANT_B }, (tx) =>
      tx.select().from(users),
    );
    expect(rows).toHaveLength(0);
  });

  it("tenant B cannot insert a row tagged tenant A", async () => {
    await expect(
      asUser({ tenantId: TENANT_B }, (tx) =>
        tx.insert(users).values({
          tenantId: TENANT_A,
          email: "evil@b.example",
          name: "Evil",
          role: "ic",
        }),
      ),
    ).rejects.toThrow();
  });

  it("tenant B cannot update tenant A rows", async () => {
    const result = await asUser({ tenantId: TENANT_B }, (tx) =>
      tx.update(users).set({ name: "hacked" }).where(eq(users.email, "secret@a.example")),
    );
    // RLS makes the row invisible → 0 rows affected.
    expect(result.count ?? 0).toBe(0);
    const stillOk = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(users),
    );
    expect(stillOk[0].name).toBe("Secret A");
  });

  it("tenant B cannot delete tenant A rows", async () => {
    const result = await asUser({ tenantId: TENANT_B }, (tx) =>
      tx.delete(users).where(eq(users.email, "secret@a.example")),
    );
    expect(result.count ?? 0).toBe(0);
    const stillThere = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(users),
    );
    expect(stillThere).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run**

Run: `npm run test:integration -- db/users.integration.test.ts`
Expected: 5 pass. (If `result.count` is undefined for postgres-js, the `?? 0` keeps it green; the follow-up positive read is the real assertion.)

- [ ] **Step 3: Commit**

```bash
git add db/users.integration.test.ts
git commit -m "test(db): adversarial tenant-isolation tests for users [ATL-014]"
```

---

### Task 10: Adversarial tests — sprints

**Files:** Create `db/sprints.integration.test.ts`

- [ ] **Step 1: Write `db/sprints.integration.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { sprints } from "./schema";
import {
  asUser,
  seedRow,
  resetDb,
  seedTenants,
  TENANT_A,
  TENANT_B,
} from "./test/helpers";

const SPRINT_A = {
  tenantId: TENANT_A,
  name: "Secret Sprint A",
  primaryFocus: "ops",
  startDate: "2026-05-18",
  endDate: "2026-06-12",
  cadence: "weekly",
  status: "active",
};

beforeEach(async () => {
  await resetDb();
  await seedTenants();
  await seedRow((tx) => tx.insert(sprints).values(SPRINT_A));
});

describe("sprints — tenant isolation", () => {
  it("tenant A reads its sprint (positive control)", async () => {
    const rows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(sprints),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Secret Sprint A");
  });

  it("tenant B cannot read tenant A sprints", async () => {
    const rows = await asUser({ tenantId: TENANT_B }, (tx) =>
      tx.select().from(sprints),
    );
    expect(rows).toHaveLength(0);
  });

  it("tenant B cannot insert a sprint tagged tenant A", async () => {
    await expect(
      asUser({ tenantId: TENANT_B }, (tx) =>
        tx.insert(sprints).values({ ...SPRINT_A, name: "Evil" }),
      ),
    ).rejects.toThrow();
  });

  it("tenant B cannot update or delete tenant A sprints", async () => {
    const upd = await asUser({ tenantId: TENANT_B }, (tx) =>
      tx.update(sprints).set({ name: "hacked" }).where(eq(sprints.name, "Secret Sprint A")),
    );
    expect(upd.count ?? 0).toBe(0);
    const del = await asUser({ tenantId: TENANT_B }, (tx) =>
      tx.delete(sprints).where(eq(sprints.name, "Secret Sprint A")),
    );
    expect(del.count ?? 0).toBe(0);
    const intact = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(sprints),
    );
    expect(intact).toHaveLength(1);
    expect(intact[0].name).toBe("Secret Sprint A");
  });
});
```

- [ ] **Step 2: Run**

Run: `npm run test:integration -- db/sprints.integration.test.ts`
Expected: 4 pass.

- [ ] **Step 3: Commit**

```bash
git add db/sprints.integration.test.ts
git commit -m "test(db): adversarial tenant-isolation tests for sprints [ATL-014]"
```

---

### Task 11: Tenants table is service-role-only

**Files:** Create `db/tenants.integration.test.ts`

- [ ] **Step 1: Write `db/tenants.integration.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { tenants } from "./schema";
import { asUser, resetDb, seedTenants, TENANT_A } from "./test/helpers";

beforeEach(async () => {
  await resetDb();
  await seedTenants();
});

describe("tenants — no RLS, not reachable by tenant users", () => {
  it("has RLS disabled (registry table)", async () => {
    // Query catalog as service role via a tenant-less read.
    const rows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.execute(
        sql`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tenants'::regclass`,
      ),
    );
    expect(rows[0].relrowsecurity).toBe(false);
  });

  it("authenticated role has no grant to read tenants directly", async () => {
    // No GRANT to authenticated on tenants ⇒ permission denied.
    await expect(
      asUser({ tenantId: TENANT_A }, (tx) => tx.select().from(tenants)),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the full integration suite**

Run: `npm run test:integration`
Expected: all tests pass (users 5, sprints 4, tenants 2).

- [ ] **Step 3: Commit**

```bash
git add db/tenants.integration.test.ts
git commit -m "test(db): tenants registry is RLS-free and not tenant-readable"
```

---

### Task 12: CI integration job

**Files:** Modify `.github/workflows/ci.yml`

- [ ] **Step 1: Add an `integration` job to `.github/workflows/ci.yml`**

Append under `jobs:` (the embedded-postgres binary runs without a service container):
```yaml
  integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run test:integration
```

- [ ] **Step 2: Verify the workflow file is valid YAML + integration passes locally**

Run: `npm run test:integration`
Expected: green (mirrors what CI will run).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run db adversarial integration tests (ADR-001 gate)"
```

---

### Task 13: Apply to the real Supabase dev project + smoke

**Files:** none (operational); may add `db/smoke-remote.ts`

> Requires a working `DATABASE_URL` in `.env.local`. The direct `db.<ref>.supabase.co`
> host may be IPv4-disabled; if `npm run db:migrate` fails with ENOTFOUND/ETIMEDOUT,
> use the **Session pooler** connection string from the Supabase dashboard
> (Connect → Session pooler) as `DATABASE_URL`.

- [ ] **Step 1: Apply migrations to the dev project**

Run: `npm run db:migrate`
Expected: prints `applied 0000_init.sql` then `migrations complete`. (No bootstrap is
applied remotely — Supabase already has the roles + `auth.jwt()`.)

- [ ] **Step 2: Smoke-check the tables exist on Supabase**

Run:
```bash
node --env-file=.env.local -e "const p=require('postgres');const s=p(process.env.DATABASE_URL);s\`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('users','sprints','tenants') ORDER BY relname\`.then(r=>{console.log(r);return s.end()})"
```
Expected: `users` and `sprints` show `relrowsecurity: true`; `tenants` shows `false`.

- [ ] **Step 3: Record the result** (no commit needed unless a helper script was added). If a script was added:
```bash
git add db/smoke-remote.ts
git commit -m "chore(db): remote smoke script for the dev Supabase project"
```

---

### Task 14: Docs, env example, wrap-up

**Files:** Modify `.env.example`, `README.md`, `docs/.../2026-06-09-supabase-rls-foundation-design.md`

- [ ] **Step 1: Update `.env.example`**

Add under the Supabase block:
```bash
# Direct Postgres / Session-pooler connection string (Drizzle migrations + queries)
# DATABASE_URL=

# Local ephemeral Postgres for adversarial RLS tests (embedded-postgres boots one
# automatically if unset)
# DATABASE_URL_TEST=
```

- [ ] **Step 2: Add a DB section to `README.md`** (under "Running the app")

```markdown
### Database (slice 1: schema + RLS)

```bash
npm run db:migrate         # apply migrations to DATABASE_URL (Supabase dev)
npm run test:integration   # adversarial RLS tests on an ephemeral local Postgres
```

Tenant isolation is enforced by Postgres RLS (ADR-001). All tenant-scoped queries
go through `withTenantContext()` in `db/client.ts`; cross-tenant/admin work goes
through `withServiceRole()` (audit-logged). The UI still runs on `lib/data.ts` —
wiring real queries via tRPC is a later slice.
```

- [ ] **Step 3: Mark the spec implemented**

In `docs/superpowers/specs/2026-06-09-supabase-rls-foundation-design.md`, set
`**Status:**` to `Implemented (branch backend-db-rls)`.

- [ ] **Step 4: Full gate**

Run: `npm run format:check && npm run typecheck && npm run lint && npm test && npm run build && npm run test:integration`
Expected: all green. (If `format:check` fails, `npm run format` and re-stage.)

- [ ] **Step 5: Commit + push**

```bash
git add .env.example README.md docs/superpowers/specs/2026-06-09-supabase-rls-foundation-design.md
git commit -m "docs(db): env example, README db section, mark spec implemented"
git push -u origin backend-db-rls
```

- [ ] **Step 6: Open PR** (manual): title `Supabase schema + RLS foundation (slice 1)`. Body: link spec + plan, note the ADR-001 adversarial gate, RLS verified on `users`/`sprints`, `tenants` registry RLS-free, applied to the dev project. **RLS-touching PR → requires 2 engineer approvals (CLAUDE.md).**

---

## Self-review notes (author)

- **Spec coverage:** §4 mechanism → Tasks 3,6; §5 schema → Tasks 2,4; §6 policies → Task 4; §7 tooling → Tasks 4,5; §8 test strategy → Tasks 7,8 (embedded-pg substituted for docker, noted); §9 adversarial → Tasks 9,10,11; §10 structure → all; §11 env/creds → Tasks 13,14; §13 success criteria → Task 14 gate + Task 13 remote.
- **Deviation:** docker-compose → embedded-postgres (Docker unavailable). Same intent; `DATABASE_URL_TEST` escape hatch preserved.
- **Type consistency:** `withTenantContext(claims, fn)`, `withServiceRole(audit{action,actor}, fn)`, `Db`, `asUser({tenantId,userId?,role?}, fn)`, `seedRow(fn)`, `resetDb()`, `seedTenants()`, `TENANT_A/B`, `runMigrations(url,{withBootstrap})` are used identically across tasks.
- **Known risk:** `embedded-postgres` must boot on the host; Task 7 Step 4 verifies early and documents the `DATABASE_URL_TEST` fallback. `result.count` from postgres-js update/delete is defensively handled with `?? 0` plus a positive-control re-read so the isolation assertion never relies solely on the count.
- **Safety:** `bootstrap.sql` is never applied to Supabase (runner `withBootstrap:false` on CLI); migrations are idempotent (`IF NOT EXISTS`, `CREATE POLICY` will error if re-run, but `schema_migrations` guards re-application).
