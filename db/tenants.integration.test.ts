import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { tenants } from "./schema";
import {
  asUser,
  resetDb,
  seedTenants,
  TENANT_A,
  TENANT_B,
} from "./test/helpers";

beforeEach(async () => {
  await resetDb();
  await seedTenants();
});

describe("tenants — self-scoped read (migration 0003)", () => {
  it("has RLS enabled", async () => {
    const rows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.execute(
        sql`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tenants'::regclass`,
      ),
    );
    expect(rows[0].relrowsecurity).toBe(true);
  });

  it("a tenant user reads only their own tenant row", async () => {
    const rows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(tenants),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(TENANT_A);
  });

  it("a tenant user cannot read another tenant's row", async () => {
    const rows = await asUser({ tenantId: TENANT_B }, (tx) =>
      tx.select().from(tenants),
    );
    expect(rows.every((r) => r.id !== TENANT_A)).toBe(true);
  });
});
