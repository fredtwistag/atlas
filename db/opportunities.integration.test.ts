import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { sprints, opportunities } from "./schema";
import {
  asUser,
  seedRow,
  resetDb,
  seedTenants,
  TENANT_A,
  TENANT_B,
} from "./test/helpers";

const SPRINT = {
  id: "11111111-1111-1111-1111-1111111111a1",
  tenantId: TENANT_A,
  name: "S",
  primaryFocus: "ops",
  startDate: "2026-05-18",
  endDate: "2026-06-12",
  cadence: "weekly",
  status: "active",
};
const OPP = {
  tenantId: TENANT_A,
  sprintId: SPRINT.id,
  title: "Secret Opp",
  description: "x",
  category: "c",
  impactLow: 1,
  impactHigh: 2,
  timeToShipWeeksLow: 1,
  timeToShipWeeksHigh: 2,
  confidenceScore: 5,
  compositeScore: "8.7",
  dimensionScores: [],
  rationale: "r",
  status: "surfaced",
};

beforeEach(async () => {
  await resetDb();
  await seedTenants();
  await seedRow((tx) => tx.insert(sprints).values(SPRINT));
  await seedRow((tx) => tx.insert(opportunities).values(OPP));
});

describe("opportunities — tenant isolation", () => {
  it("tenant A reads its opportunity", async () => {
    const rows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(opportunities),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Secret Opp");
  });

  it("tenant B reads none", async () => {
    const rows = await asUser({ tenantId: TENANT_B }, (tx) =>
      tx.select().from(opportunities),
    );
    expect(rows).toHaveLength(0);
  });

  it("tenant B cannot insert tagged tenant A", async () => {
    await expect(
      asUser({ tenantId: TENANT_B }, (tx) =>
        tx.insert(opportunities).values({ ...OPP, title: "Evil" }),
      ),
    ).rejects.toThrow();
  });

  it("tenant B cannot delete tenant A rows", async () => {
    const res = await asUser({ tenantId: TENANT_B }, (tx) =>
      tx.delete(opportunities).where(eq(opportunities.title, "Secret Opp")),
    );
    expect(res.count ?? 0).toBe(0);
  });
});
