import { describe, it, expect, beforeEach } from "vitest";
import { companyContext } from "./schema";
import {
  asUser,
  seedRow,
  resetDb,
  seedTenants,
  TENANT_A,
  TENANT_B,
} from "./test/helpers";

// CTX-1 — company_context tenant isolation + write restriction.
// Tenant users may READ their own context (it is injected into IC prompts
// server-side) but may NOT write it — writes are service_role/Twistag only.

beforeEach(async () => {
  await resetDb();
  await seedTenants();
  await seedRow((tx) =>
    tx.insert(companyContext).values({
      tenantId: TENANT_A,
      summary: "Mid-market B2B distributor with manual quoting.",
      industry: "Wholesale distribution",
      status: "active",
    }),
  );
});

describe("company_context — tenant isolation", () => {
  it("tenant A reads its own context", async () => {
    const rows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(companyContext),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].industry).toBe("Wholesale distribution");
  });

  it("tenant B reads none (cross-tenant isolation)", async () => {
    const rows = await asUser({ tenantId: TENANT_B }, (tx) =>
      tx.select().from(companyContext),
    );
    expect(rows).toHaveLength(0);
  });
});

describe("company_context — writes are service-role only", () => {
  it("a tenant user cannot insert its own context (no tenant write policy)", async () => {
    await expect(
      asUser({ tenantId: TENANT_A }, (tx) =>
        tx.insert(companyContext).values({
          tenantId: TENANT_A,
          summary: "self-serve write that must be denied",
        }),
      ),
    ).rejects.toThrow();
  });

  it("tenant B cannot insert a row tagged as tenant A", async () => {
    await expect(
      asUser({ tenantId: TENANT_B }, (tx) =>
        tx.insert(companyContext).values({
          tenantId: TENANT_A,
          summary: "cross-tenant write that must be denied",
        }),
      ),
    ).rejects.toThrow();
  });
});
