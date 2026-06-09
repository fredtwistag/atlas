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
    const rows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.execute(
        sql`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tenants'::regclass`,
      ),
    );
    expect(rows[0].relrowsecurity).toBe(false);
  });

  it("authenticated role has no grant to read tenants directly", async () => {
    await expect(
      asUser({ tenantId: TENANT_A }, (tx) => tx.select().from(tenants)),
    ).rejects.toThrow();
  });
});
