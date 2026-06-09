import { describe, it, expect, beforeEach } from "vitest";
import { createCallerFactory } from "./trpc";
import { appRouter } from "./routers/_app";
import { sprints, opportunities } from "@/db/schema";
import {
  seedRow,
  resetDb,
  seedTenants,
  TENANT_A,
  TENANT_B,
} from "@/db/test/helpers";

const SPRINT_A = "33333333-3333-4333-8333-3333333333a1";
const SPRINT_B = "33333333-3333-4333-8333-3333333333b1";

function sprintRow(id: string, tenantId: string) {
  return {
    id,
    tenantId,
    name: "S",
    primaryFocus: "ops",
    startDate: "2026-05-18",
    endDate: "2026-06-12",
    cadence: "weekly",
    status: "active",
  };
}
function oppRow(tenantId: string, sprintId: string, title: string) {
  return {
    tenantId,
    sprintId,
    title,
    description: "x",
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

const createCaller = createCallerFactory(appRouter);
const asTenant = (tenantId: string) =>
  createCaller({
    session: {
      kind: "tenant",
      tenantId,
      userId: "00000000-0000-0000-0000-0000000000ff",
      role: "manager",
    },
  });

beforeEach(async () => {
  await resetDb();
  await seedTenants();
  await seedRow((tx) =>
    tx.insert(sprints).values(sprintRow(SPRINT_A, TENANT_A)),
  );
  await seedRow((tx) =>
    tx.insert(sprints).values(sprintRow(SPRINT_B, TENANT_B)),
  );
  await seedRow((tx) =>
    tx.insert(opportunities).values(oppRow(TENANT_A, SPRINT_A, "A opp")),
  );
  await seedRow((tx) =>
    tx.insert(opportunities).values(oppRow(TENANT_B, SPRINT_B, "B opp")),
  );
});

describe("tRPC routers — tenant isolation", () => {
  it("tenant A reads its own sprint + opportunity", async () => {
    const api = asTenant(TENANT_A);
    const s = await api.sprint.get({ id: SPRINT_A });
    expect(s.id).toBe(SPRINT_A);
    const opps = await api.opportunity.listForSprint({ sprintId: SPRINT_A });
    expect(opps.map((o) => o.title)).toEqual(["A opp"]);
  });

  it("tenant A cannot read tenant B's sprint", async () => {
    const api = asTenant(TENANT_A);
    await expect(api.sprint.get({ id: SPRINT_B })).rejects.toThrow();
  });

  it("tenant A sees no opportunities for tenant B's sprint", async () => {
    const api = asTenant(TENANT_A);
    const opps = await api.opportunity.listForSprint({ sprintId: SPRINT_B });
    expect(opps).toHaveLength(0);
  });

  it("a non-tenant (twistag) session is rejected by tenantProcedure", async () => {
    const api = createCaller({
      session: { kind: "twistag", twistagRole: "twistag_admin", userId: "x" },
    });
    await expect(api.sprint.get({ id: SPRINT_A })).rejects.toThrow();
  });
});
