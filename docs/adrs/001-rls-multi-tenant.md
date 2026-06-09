# ADR-001 — Row-Level Security for multi-tenant isolation

**Status:** Accepted · 2026-06-08
**Owner:** Engineering lead
**Supersedes:** Earlier draft of `docs/02-architecture.md` §3 (schema-per-tenant)

---

## Context

Atlas is a multi-tenant SaaS where each client's data must be strictly isolated from every other client's data. We considered two patterns:

**Option A — Schema-per-tenant:** each client gets a dedicated Postgres schema (`tenant_acme`, `tenant_vivex`). Tenant context selects schema. Physical separation in same DB.

**Option B — RLS (Row-Level Security):** single schema, every table has `tenant_id`, Postgres RLS policies enforce `tenant_id = auth.jwt()->>'tenant_id'`.

**Original draft chose Option A** on the basis that schema isolation is "verifiable by inspection." Battle-test re-evaluated:

- Schema-per-tenant requires every migration to be applied N times (where N = tenant count). At 30+ tenants this becomes operational overhead with real drift risk.
- Supabase is purpose-built for RLS: auth helpers, realtime subscriptions, storage policies, generated client all assume single-schema + RLS.
- Industry convention for production multi-tenant SaaS (Notion, Linear, Vercel, Stripe) is RLS with `tenant_id`, not schema-per-tenant.
- "Verifiability" of RLS is achievable via adversarial tests at the policy level, which are smaller surface area than verifying N schemas haven't drifted.

## Decision

**Adopt Row-Level Security on a single schema with `tenant_id` column.** Reserve dedicated-database deployment (separate Supabase project) as an optional add-on for top-tier enterprise clients that require physical isolation contractually.

## Implementation pattern

### Every tenant-scoped table includes:
```sql
tenant_id UUID NOT NULL REFERENCES public.tenants(id),
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

### Every tenant-scoped table has RLS enabled with the standard policy set:
```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<table>_tenant_select" ON <table>
  FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY "<table>_tenant_insert" ON <table>
  FOR INSERT
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY "<table>_tenant_update" ON <table>
  FOR UPDATE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY "<table>_tenant_delete" ON <table>
  FOR DELETE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

### Indexes:
```sql
CREATE INDEX <table>_tenant_idx ON <table>(tenant_id);
-- AND any composite indexes that include tenant_id first if heavy filter
```

### Service-role bypass usage:
Only allowed inside Inngest workers and explicit cross-tenant operations (e.g. pattern library maintenance). Every bypass-role connection is wrapped in:
```typescript
await withServiceRole(async (db) => {
  // explicit audit log entry
  // bounded scope
});
```

### Twistag-side users
Twistag staff (engagement leads, account managers) need to access multiple tenants. Their JWT contains a special `twistag_role` claim that triggers different policies:
- Read-only access to all tenants by default
- Write access requires explicit tenant impersonation: `?tenant=<slug>` in URL re-mints JWT with that tenant_id, audit-logged

## Adversarial testing required

Every PR that adds a tenant-scoped table or modifies an RLS policy must include tests:

```typescript
describe('<table> isolation', () => {
  it('prevents reading other tenant rows', async () => {
    await asUser('tenant_a_user', async (db) => {
      const result = await db.from('<table>').select().eq('tenant_id', 'tenant_b_id');
      expect(result.data).toHaveLength(0);
    });
  });

  it('prevents inserting into other tenant', async () => {
    await asUser('tenant_a_user', async (db) => {
      const result = await db.from('<table>').insert({ tenant_id: 'tenant_b_id', /* ... */ });
      expect(result.error).toBeTruthy();
    });
  });

  // Repeat for update and delete
});
```

CI gate: these tests must pass on every PR. No exceptions.

## Consequences

**Positive:**
- Operational simplicity: single migration set, single backup, single monitoring scope
- Native Supabase: auth, realtime, storage all work without workarounds
- Industry-standard pattern: hiring, debugging, onboarding all easier
- Adversarial test gate enforces security at policy level

**Negative:**
- Single mistaken policy = data leak. Mitigation: 2-eng PR review + adversarial tests + monthly policy audit.
- Performance: heavy RLS policies can hurt query planning. Mitigation: keep policies simple; index on `tenant_id`; use `EXPLAIN` to validate query plans.
- Tenants share connection pool. Mitigation: monitor per-tenant rate limits at application layer.

**Neutral:**
- No physical isolation by default. For clients with regulatory requirements, offer dedicated Supabase project as add-on (Portfolio tier, future).

## Alternatives considered

1. **Schema-per-tenant** (original draft) — rejected: operational complexity at scale, Supabase friction.
2. **Database-per-tenant** — too costly; only for top-tier enterprise.
3. **Application-layer tenant filtering (no DB enforcement)** — rejected: one missed filter = data leak. Defense-in-depth requires DB-level enforcement.
4. **MikroORM/Prisma tenant middleware** — rejected: Drizzle is our ORM and Supabase auth maps cleanly to RLS.

## Review

Revisit this decision when:
- We hit 50+ active tenants (does operational pattern still feel right?)
- We sign a client with explicit physical-isolation contractual requirement
- We see RLS query performance issues that simple indexes don't solve
