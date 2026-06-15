import { describe, it, expect, beforeEach } from "vitest";
import { sprints, stakeholders } from "./schema";
import {
  asUser,
  seedRow,
  resetDb,
  seedTenants,
  TENANT_A,
  TENANT_B,
} from "./test/helpers";

// Ticket B — stakeholders tenant isolation + write restriction.

const SPRINT_A = "33333333-3333-4333-8333-3333333333b1";

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
    await tx.insert(stakeholders).values({
      tenantId: TENANT_A,
      sprintId: SPRINT_A,
      roleLabel: "VP Sales",
      department: "Sales",
      type: "decision_maker",
      summary: "Gates all custom pricing approvals.",
    });
  });
});

describe("stakeholders — tenant isolation", () => {
  it("tenant A reads its stakeholders (role label, no names)", async () => {
    const rows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(stakeholders),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].roleLabel).toBe("VP Sales");
  });

  it("tenant B reads none", async () => {
    const rows = await asUser({ tenantId: TENANT_B }, (tx) =>
      tx.select().from(stakeholders),
    );
    expect(rows).toHaveLength(0);
  });

  it("a tenant user cannot insert stakeholders (service-role only)", async () => {
    await expect(
      asUser({ tenantId: TENANT_A }, (tx) =>
        tx.insert(stakeholders).values({
          tenantId: TENANT_A,
          sprintId: SPRINT_A,
          roleLabel: "x",
          type: "blocker",
          summary: "denied",
        }),
      ),
    ).rejects.toThrow();
  });
});
