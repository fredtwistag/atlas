import { describe, it, expect, beforeEach } from "vitest";
import { sprints, systemInventoryItems } from "./schema";
import {
  asUser,
  seedRow,
  resetDb,
  seedTenants,
  TENANT_A,
  TENANT_B,
} from "./test/helpers";

// Ticket F — system_inventory_items tenant isolation + write restriction.

const SPRINT_A = "33333333-3333-4333-8333-3333333333f1";

beforeEach(async () => {
  await resetDb();
  await seedTenants();
  await seedRow(async (tx) => {
    await tx.insert(sprints).values({
      id: SPRINT_A,
      tenantId: TENANT_A,
      name: "Sprint A",
      primaryFocus: "ops",
      startDate: "2026-06-01",
      endDate: "2026-06-28",
      cadence: "weekly",
      status: "active",
    });
    await tx.insert(systemInventoryItems).values({
      tenantId: TENANT_A,
      sprintId: SPRINT_A,
      name: "Pricing spreadsheet",
      category: "shadow_tool",
      summary: "AEs keep custom pricing in a shared spreadsheet.",
    });
  });
});

describe("system_inventory_items — tenant isolation", () => {
  it("tenant A reads its inventory", async () => {
    const rows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(systemInventoryItems),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe("shadow_tool");
  });

  it("tenant B reads none", async () => {
    const rows = await asUser({ tenantId: TENANT_B }, (tx) =>
      tx.select().from(systemInventoryItems),
    );
    expect(rows).toHaveLength(0);
  });

  it("a tenant user cannot insert inventory (writes are service-role only)", async () => {
    await expect(
      asUser({ tenantId: TENANT_A }, (tx) =>
        tx.insert(systemInventoryItems).values({
          tenantId: TENANT_A,
          sprintId: SPRINT_A,
          name: "x",
          category: "system",
          summary: "denied",
        }),
      ),
    ).rejects.toThrow();
  });
});
