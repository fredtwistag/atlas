import { describe, it, expect, beforeEach } from "vitest";
import { sprints, opportunities, sowDrafts } from "./schema";
import {
  asUser,
  seedRow,
  resetDb,
  seedTenants,
  TENANT_A,
  TENANT_B,
} from "./test/helpers";

const SPRINT = "88888888-8888-4888-8888-88888888a001";
const OPP = "88888888-8888-4888-8888-88888888a002";

function sprintRow() {
  return {
    id: SPRINT,
    tenantId: TENANT_A,
    name: "S",
    primaryFocus: "ops",
    startDate: "2026-05-18",
    endDate: "2026-06-12",
    cadence: "weekly",
    status: "active",
  };
}
function oppRow() {
  return {
    id: OPP,
    tenantId: TENANT_A,
    sprintId: SPRINT,
    title: "T",
    description: "d",
    category: "c",
    impactLow: 1,
    impactHigh: 2,
    timeToShipWeeksLow: 1,
    timeToShipWeeksHigh: 2,
    confidenceScore: 5,
    compositeScore: "8.0",
    dimensionScores: [],
    rationale: "r",
    status: "surfaced",
  };
}
function draftRow() {
  return {
    tenantId: TENANT_A,
    opportunityId: OPP,
    sprintId: SPRINT,
    title: "SOW",
    scope: "scope",
    inclusions: ["a"],
    exclusions: [],
    team: [{ role: "FDE", allocation: "Full" }],
    durationWeeks: 5,
    priceUsd: 68000,
    successMetrics: ["m"],
    status: "draft",
  };
}

beforeEach(async () => {
  await resetDb();
  await seedTenants();
  await seedRow((tx) => tx.insert(sprints).values(sprintRow()));
  await seedRow((tx) => tx.insert(opportunities).values(oppRow()));
  await seedRow((tx) => tx.insert(sowDrafts).values(draftRow()));
});

describe("sow_drafts — tenant isolation", () => {
  it("tenant A reads its own draft", async () => {
    const rows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(sowDrafts),
    );
    expect(rows).toHaveLength(1);
  });

  it("tenant B reads none (adversarial)", async () => {
    const rows = await asUser({ tenantId: TENANT_B }, (tx) =>
      tx.select().from(sowDrafts),
    );
    expect(rows).toHaveLength(0);
  });

  it("tenant B cannot insert a draft tagged tenant A", async () => {
    await expect(
      asUser({ tenantId: TENANT_B }, (tx) =>
        tx.insert(sowDrafts).values(draftRow()),
      ),
    ).rejects.toThrow();
  });
});
