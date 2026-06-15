import { describe, it, expect, beforeEach } from "vitest";
import { sprints, opportunities, portfolios, portfolioItems } from "./schema";
import {
  asUser,
  seedRow,
  resetDb,
  seedTenants,
  TENANT_A,
  TENANT_B,
} from "./test/helpers";

// Ticket A — portfolios / portfolio_items tenant isolation + write restriction.
// Tenant users READ their own portfolio; writes are service_role only.

const SPRINT_A = "33333333-3333-4333-8333-3333333333a1";
const OPP_A = "44444444-4444-4444-8444-44444444a0a1";

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
    await tx.insert(opportunities).values({
      id: OPP_A,
      tenantId: TENANT_A,
      sprintId: SPRINT_A,
      title: "Automate credit-hold release",
      description: "d",
      category: "Order-to-cash",
      impactLow: 100000,
      impactHigh: 200000,
      timeToShipWeeksLow: 2,
      timeToShipWeeksHigh: 4,
      confidenceScore: 4,
      compositeScore: "8.1",
      dimensionScores: [],
      rationale: "r",
      status: "surfaced",
    });
    const [p] = await tx
      .insert(portfolios)
      .values({ tenantId: TENANT_A, sprintId: SPRINT_A, narrative: "n" })
      .returning({ id: portfolios.id });
    await tx.insert(portfolioItems).values({
      portfolioId: p.id,
      opportunityId: OPP_A,
      tenantId: TENANT_A,
      sequenceOrder: 1,
      inclusionRationale: "Quick win.",
    });
  });
});

describe("portfolios — tenant isolation", () => {
  it("tenant A reads its portfolio + items", async () => {
    const ps = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(portfolios),
    );
    const items = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(portfolioItems),
    );
    expect(ps).toHaveLength(1);
    expect(items).toHaveLength(1);
  });

  it("tenant B reads none of either table", async () => {
    const ps = await asUser({ tenantId: TENANT_B }, (tx) =>
      tx.select().from(portfolios),
    );
    const items = await asUser({ tenantId: TENANT_B }, (tx) =>
      tx.select().from(portfolioItems),
    );
    expect(ps).toHaveLength(0);
    expect(items).toHaveLength(0);
  });
});

describe("portfolios — writes are service-role only", () => {
  it("a tenant user cannot insert a portfolio (no tenant write policy)", async () => {
    await expect(
      asUser({ tenantId: TENANT_A }, (tx) =>
        tx
          .insert(portfolios)
          .values({ tenantId: TENANT_A, sprintId: SPRINT_A, narrative: "x" }),
      ),
    ).rejects.toThrow();
  });
});
