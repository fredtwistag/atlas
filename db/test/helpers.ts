import { eq, sql } from "drizzle-orm";
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
export function seedRow<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  return withServiceRole({ action: "test.seed", actor: "test" }, fn);
}

/**
 * Run an arbitrary statement as service_role (bypasses RLS) for test
 * arrangement and assertions. Audited under "test.svc" so it never collides
 * with the action a test is asserting on (e.g. "opportunity.recompute").
 */
export function withServiceRoleRaw<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  return withServiceRole({ action: "test.svc", actor: "test" }, fn);
}

/** Truncate tenant-scoped tables + tenants between tests (service role). */
export async function resetDb(): Promise<void> {
  await withServiceRole({ action: "test.reset", actor: "test" }, async (tx) => {
    await tx.execute(
      sql`TRUNCATE public.documents, public.workflow_maps,
          public.stakeholder_opportunity, public.stakeholders,
          public.system_inventory_evidence, public.system_inventory_items,
          public.portfolio_items, public.portfolios,
          public.opportunity_evidence, public.opportunities, public.captures,
          public.sessions, public.sprint_participants, public.topics,
          public.invitations, public.sprints, public.company_context,
          public.users, public.tenants
          RESTART IDENTITY CASCADE`,
    );
    // audit_log uses a bigserial whose sequence service_role doesn't own, so
    // RESTART IDENTITY is out — a plain DELETE clears it for deterministic
    // audit-based assertions (the id is never asserted on).
    await tx.execute(sql`DELETE FROM public.audit_log`);
    // rate_limits is infrastructure (not in the TRUNCATE list / no tenant_id);
    // clear it so limiter windows don't leak across tests.
    await tx.execute(sql`DELETE FROM public.rate_limits`);
  });
}

/** Seed the two baseline tenants. */
export async function seedTenants(): Promise<void> {
  await seedRow((tx) =>
    tx.insert(tenants).values([
      {
        id: TENANT_A,
        slug: "tenant-a",
        name: "Tenant A",
        segment: "test",
        status: "active",
      },
      {
        id: TENANT_B,
        slug: "tenant-b",
        name: "Tenant B",
        segment: "test",
        status: "active",
      },
    ]),
  );
}

export { eq, sql };
