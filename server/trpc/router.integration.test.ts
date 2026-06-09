import { describe, it, expect, beforeEach } from "vitest";
import { createCallerFactory } from "./trpc";
import { appRouter } from "./routers/_app";
import {
  sprints,
  opportunities,
  users,
  topics,
  sprintParticipants,
  sessions,
} from "@/db/schema";
import {
  seedRow,
  resetDb,
  seedTenants,
  asUser,
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

const MGR_A = "44444444-4444-4444-8444-44444444a001";
const IC_A1 = "44444444-4444-4444-8444-44444444a002";
const IC_A2 = "44444444-4444-4444-8444-44444444a003";

const asManager = (tenantId: string, userId: string) =>
  createCaller({
    session: { kind: "tenant", tenantId, userId, role: "manager" },
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

describe("sprint.launch", () => {
  beforeEach(async () => {
    // resetDb()/seedTenants() already ran in the outer beforeEach; add users.
    await seedRow((tx) =>
      tx.insert(users).values([
        {
          id: MGR_A,
          tenantId: TENANT_A,
          email: "mgr@a.example",
          name: "Mgr A",
          role: "manager",
          department: "Ops",
        },
        {
          id: IC_A1,
          tenantId: TENANT_A,
          email: "ic1@a.example",
          name: "IC One",
          role: "ic",
          department: "Finance",
        },
        {
          id: IC_A2,
          tenantId: TENANT_A,
          email: "ic2@a.example",
          name: "IC Two",
          role: "ic",
          department: "Sales",
        },
      ]),
    );
  });

  it("creates sprint + topics + participants + sessions for the manager's tenant", async () => {
    const api = asManager(TENANT_A, MGR_A);
    const sprintId = await api.sprint.launch({
      name: "Ops Discovery",
      primaryFocus: "Quote-to-cash",
      topicKeys: ["how-work-flows", "when-things-break"],
      participantIds: [IC_A1, IC_A2],
    });
    expect(typeof sprintId).toBe("string");

    const topicRows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(topics),
    );
    expect(topicRows).toHaveLength(2);

    const partRows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(sprintParticipants),
    );
    expect(partRows).toHaveLength(2);
    expect(partRows.every((p) => p.sessionsTotal === 2)).toBe(true);
    expect(partRows.every((p) => p.status === "not_started")).toBe(true);

    const sessionRows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(sessions),
    );
    expect(sessionRows).toHaveLength(4); // 2 participants x 2 topics
    expect(sessionRows.every((s) => s.status === "not_started")).toBe(true);
  });

  it("isolates tenants — A cannot see a sprint B launched", async () => {
    const MGR_B = "44444444-4444-4444-8444-44444444b001";
    const IC_B1 = "44444444-4444-4444-8444-44444444b002";
    await seedRow((tx) =>
      tx.insert(users).values([
        {
          id: MGR_B,
          tenantId: TENANT_B,
          email: "mgr@b.example",
          name: "Mgr B",
          role: "manager",
          department: "Ops",
        },
        {
          id: IC_B1,
          tenantId: TENANT_B,
          email: "ic1@b.example",
          name: "IC B",
          role: "ic",
          department: "Ops",
        },
      ]),
    );
    await asManager(TENANT_B, MGR_B).sprint.launch({
      name: "B Sprint",
      primaryFocus: "B focus",
      topicKeys: ["one-change"],
      participantIds: [IC_B1],
    });

    const aTopics = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(topics),
    );
    expect(aTopics).toHaveLength(0);
  });

  it("rejects an IC session (managerProcedure)", async () => {
    const api = createCaller({
      session: {
        kind: "tenant",
        tenantId: TENANT_A,
        userId: IC_A1,
        role: "ic",
      },
    });
    await expect(
      api.sprint.launch({
        name: "x",
        primaryFocus: "y",
        topicKeys: ["one-change"],
        participantIds: [IC_A1],
      }),
    ).rejects.toThrow();
  });
});
