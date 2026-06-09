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
