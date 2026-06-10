import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createCallerFactory } from "./trpc";
import { appRouter } from "./routers/_app";
import {
  sprints,
  opportunities,
  users,
  topics,
  sprintParticipants,
  sessions,
  sowDrafts,
  auditLog,
  captures,
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
const IC_VIEW = "55555555-5555-4555-8555-55555555a001";

const asManager = (tenantId: string, userId: string) =>
  createCaller({
    session: { kind: "tenant", tenantId, userId, role: "manager" },
  });

const asIc = (tenantId: string, userId: string) =>
  createCaller({
    session: { kind: "tenant", tenantId, userId, role: "ic" },
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

describe("session.myDashboard / session.get", () => {
  const TOPIC_ID = "55555555-5555-4555-8555-55555555a010";
  const SES_ID = "55555555-5555-4555-8555-55555555a020";

  beforeEach(async () => {
    await seedRow((tx) =>
      tx.insert(users).values({
        id: IC_VIEW,
        tenantId: TENANT_A,
        email: "view@a.example",
        name: "Viewer",
        role: "ic",
        department: "Ops",
      }),
    );
    // SPRINT_A already exists (outer beforeEach). Add a topic, participant, session.
    await seedRow((tx) =>
      tx.insert(topics).values({
        id: TOPIC_ID,
        tenantId: TENANT_A,
        sprintId: SPRINT_A,
        title: "How work flows",
        description: "desc",
        orderIdx: 1,
        questionCount: 5,
        estMinutes: 6,
      }),
    );
    await seedRow((tx) =>
      tx.insert(sprintParticipants).values({
        tenantId: TENANT_A,
        sprintId: SPRINT_A,
        userId: IC_VIEW,
        status: "not_started",
        sessionsCompleted: 0,
        sessionsTotal: 1,
      }),
    );
    await seedRow((tx) =>
      tx.insert(sessions).values({
        id: SES_ID,
        tenantId: TENANT_A,
        sprintId: SPRINT_A,
        topicId: TOPIC_ID,
        userId: IC_VIEW,
        status: "not_started",
      }),
    );
  });

  it("returns the IC's active sprint sessions", async () => {
    const data = await asIc(TENANT_A, IC_VIEW).session.myDashboard();
    expect(data).not.toBeNull();
    expect(data!.sprintId).toBe(SPRINT_A);
    expect(data!.sessions).toHaveLength(1);
    expect(data!.sessions[0].topicTitle).toBe("How work flows");
  });

  it("returns null for a user who is not a participant", async () => {
    const other = "55555555-5555-4555-8555-55555555a099";
    await seedRow((tx) =>
      tx.insert(users).values({
        id: other,
        tenantId: TENANT_A,
        email: "no@a.example",
        name: "No",
        role: "ic",
        department: "Ops",
      }),
    );
    const data = await asIc(TENANT_A, other).session.myDashboard();
    expect(data).toBeNull();
  });

  it("session.get returns the topic title for the owning tenant", async () => {
    const s = await asIc(TENANT_A, IC_VIEW).session.get({ id: SES_ID });
    expect(s.topicTitle).toBe("How work flows");
  });

  it("session.get is blocked cross-tenant (NOT_FOUND under RLS)", async () => {
    await expect(
      asIc(TENANT_B, IC_VIEW).session.get({ id: SES_ID }),
    ).rejects.toThrow();
  });
});

describe("twistag.clientList", () => {
  it("aggregates clients across tenants for a twistag session", async () => {
    // SPRINT_A (TENANT_A) + SPRINT_B (TENANT_B) + their opportunities exist
    // from the outer beforeEach.
    const api = createCaller({
      session: {
        kind: "twistag",
        twistagRole: "twistag_admin",
        userId: "00000000-0000-4000-8000-0000000000ff",
      },
    });
    const clients = await api.twistag.clientList();
    expect(clients.length).toBeGreaterThanOrEqual(2);
    const names = clients.map((c) => c.name).sort();
    expect(names).toContain("Tenant A");
    expect(names).toContain("Tenant B");
    const a = clients.find((c) => c.name === "Tenant A")!;
    expect(a.opportunities).toBeGreaterThanOrEqual(1);
    expect(["healthy", "watch", "at_risk"]).toContain(a.health);
  });

  it("rejects a tenant session (twistagProcedure)", async () => {
    const api = asTenant(TENANT_A);
    await expect(api.twistag.clientList()).rejects.toThrow();
  });
});

describe("opportunity.approve", () => {
  const OPP_ID = "99999999-9999-4999-8999-99999999a001";
  const MGR = "99999999-9999-4999-8999-99999999a0ff";

  beforeEach(async () => {
    await seedRow((tx) =>
      tx.insert(users).values({
        id: MGR,
        tenantId: TENANT_A,
        email: "mgr2@a.example",
        name: "Mgr2",
        role: "manager",
        department: "Ops",
      }),
    );
    await seedRow((tx) =>
      tx.insert(opportunities).values({
        id: OPP_ID,
        tenantId: TENANT_A,
        sprintId: SPRINT_A,
        title: "Approve me",
        description: "d",
        category: "c",
        impactLow: 1,
        impactHigh: 2,
        timeToShipWeeksLow: 1,
        timeToShipWeeksHigh: 4,
        confidenceScore: 5,
        compositeScore: "8.0",
        dimensionScores: [],
        rationale: "r",
        status: "surfaced",
      }),
    );
  });

  it("manager approve persists a sow_draft + flips status", async () => {
    const api = asManager(TENANT_A, MGR);
    const res = await api.opportunity.approve({ id: OPP_ID });
    expect(res.status).toBe("approved");
    expect(res.sowDraft.durationWeeks).toBe(4);

    const opp = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(opportunities).where(eq(opportunities.id, OPP_ID)),
    );
    expect(opp[0].status).toBe("approved");
    expect(opp[0].approvedBy).toBe(MGR);

    const drafts = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(sowDrafts).where(eq(sowDrafts.opportunityId, OPP_ID)),
    );
    expect(drafts).toHaveLength(1);
  });

  it("is idempotent on re-approve (no duplicate draft)", async () => {
    const api = asManager(TENANT_A, MGR);
    await api.opportunity.approve({ id: OPP_ID });
    await api.opportunity.approve({ id: OPP_ID });
    const drafts = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(sowDrafts).where(eq(sowDrafts.opportunityId, OPP_ID)),
    );
    expect(drafts).toHaveLength(1);
  });

  it("rejects an IC session", async () => {
    const api = asIc(TENANT_A, MGR);
    await expect(api.opportunity.approve({ id: OPP_ID })).rejects.toThrow();
  });

  it("a sponsor can also approve (shared managerProcedure)", async () => {
    const SPONSOR = "99999999-9999-4999-8999-99999999a0aa";
    await seedRow((tx) =>
      tx.insert(users).values({
        id: SPONSOR,
        tenantId: TENANT_A,
        email: "sponsor@a.example",
        name: "Sponsor",
        role: "sponsor",
        department: "Exec",
      }),
    );
    const api = createCaller({
      session: {
        kind: "tenant",
        tenantId: TENANT_A,
        userId: SPONSOR,
        role: "sponsor",
      },
    });
    const res = await api.opportunity.approve({ id: OPP_ID });
    expect(res.status).toBe("approved");
    const opp = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(opportunities).where(eq(opportunities.id, OPP_ID)),
    );
    expect(opp[0].status).toBe("approved");
    expect(opp[0].approvedBy).toBe(SPONSOR);
  });

  it("tenant B cannot approve tenant A's opportunity", async () => {
    const MGR_B = "99999999-9999-4999-8999-99999999b0ff";
    await seedRow((tx) =>
      tx.insert(users).values({
        id: MGR_B,
        tenantId: TENANT_B,
        email: "mgrb@b.example",
        name: "MgrB",
        role: "manager",
        department: "Ops",
      }),
    );
    await expect(
      asManager(TENANT_B, MGR_B).opportunity.approve({ id: OPP_ID }),
    ).rejects.toThrow();
  });
});

describe("sprint.participant", () => {
  const PUSER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001";
  const PMGR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa00ff";

  beforeEach(async () => {
    await seedRow((tx) =>
      tx.insert(users).values([
        {
          id: PUSER,
          tenantId: TENANT_A,
          email: "p@a.example",
          name: "Pat",
          role: "ic",
          department: "Ops",
          title: "Coordinator",
        },
        {
          id: PMGR,
          tenantId: TENANT_A,
          email: "pm@a.example",
          name: "PM",
          role: "manager",
          department: "Ops",
        },
      ]),
    );
    await seedRow((tx) =>
      tx.insert(sprintParticipants).values({
        tenantId: TENANT_A,
        sprintId: SPRINT_A,
        userId: PUSER,
        status: "idle",
        sessionsCompleted: 1,
        sessionsTotal: 4,
      }),
    );
    await seedRow((tx) =>
      tx.insert(topics).values({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0d01",
        tenantId: TENANT_A,
        sprintId: SPRINT_A,
        title: "How work flows",
        description: "d",
        orderIdx: 1,
        questionCount: 5,
        estMinutes: 6,
      }),
    );
    await seedRow((tx) =>
      tx.insert(sessions).values({
        tenantId: TENANT_A,
        sprintId: SPRINT_A,
        topicId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0d01",
        userId: PUSER,
        status: "completed",
      }),
    );
  });

  it("includes the participant's per-session breakdown", async () => {
    const p = await asManager(TENANT_A, PMGR).sprint.participant({
      sprintId: SPRINT_A,
      userId: PUSER,
    });
    expect(p.sessions).toEqual([
      { topicTitle: "How work flows", status: "completed" },
    ]);
  });

  it("returns a participant's nudge view", async () => {
    const p = await asManager(TENANT_A, PMGR).sprint.participant({
      sprintId: SPRINT_A,
      userId: PUSER,
    });
    expect(p.name).toBe("Pat");
    expect(p.sessionsCompleted).toBe(1);
    expect(p.status).toBe("idle");
  });

  it("rejects an IC", async () => {
    await expect(
      asIc(TENANT_A, PUSER).sprint.participant({
        sprintId: SPRINT_A,
        userId: PUSER,
      }),
    ).rejects.toThrow();
  });

  it("cross-tenant → NOT_FOUND", async () => {
    const MGRB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaab0ff";
    await seedRow((tx) =>
      tx.insert(users).values({
        id: MGRB,
        tenantId: TENANT_B,
        email: "mb@b.example",
        name: "MB",
        role: "manager",
        department: "Ops",
      }),
    );
    await expect(
      asManager(TENANT_B, MGRB).sprint.participant({
        sprintId: SPRINT_A,
        userId: PUSER,
      }),
    ).rejects.toThrow();
  });
});

describe("session.editView", () => {
  const EUSER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001";
  const EOTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002";
  const ETOPIC = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0010";
  const ESES = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0020";

  beforeEach(async () => {
    await seedRow((tx) =>
      tx.insert(users).values([
        {
          id: EUSER,
          tenantId: TENANT_A,
          email: "e@a.example",
          name: "Ed",
          role: "ic",
          department: "Ops",
        },
        {
          id: EOTHER,
          tenantId: TENANT_A,
          email: "e2@a.example",
          name: "Eve",
          role: "ic",
          department: "Ops",
        },
      ]),
    );
    await seedRow((tx) =>
      tx.insert(topics).values({
        id: ETOPIC,
        tenantId: TENANT_A,
        sprintId: SPRINT_A,
        title: "How work flows",
        description: "d",
        orderIdx: 1,
        questionCount: 5,
        estMinutes: 6,
      }),
    );
    await seedRow((tx) =>
      tx.insert(sessions).values({
        id: ESES,
        tenantId: TENANT_A,
        sprintId: SPRINT_A,
        topicId: ETOPIC,
        userId: EUSER,
        status: "completed",
      }),
    );
  });

  it("returns the owner's session edit view (captures empty for now)", async () => {
    const v = await asIc(TENANT_A, EUSER).session.editView({ id: ESES });
    expect(v.topicTitle).toBe("How work flows");
    expect(Array.isArray(v.captures)).toBe(true);
    expect(v.captures).toHaveLength(0);
  });

  it("another user in the tenant cannot read it (NOT_FOUND)", async () => {
    await expect(
      asIc(TENANT_A, EOTHER).session.editView({ id: ESES }),
    ).rejects.toThrow();
  });
});

describe("sprint.nudge", () => {
  const NMGR = "eeeeeeee-eeee-4eee-8eee-eeeeeeee00ff";
  const NIC = "eeeeeeee-eeee-4eee-8eee-eeeeeeee0001";

  beforeEach(async () => {
    await seedRow((tx) =>
      tx.insert(users).values([
        {
          id: NMGR,
          tenantId: TENANT_A,
          email: "nm@a.example",
          name: "Nudge Mgr",
          role: "manager",
          department: "Ops",
        },
        {
          id: NIC,
          tenantId: TENANT_A,
          email: "ni@a.example",
          name: "Nudge IC",
          role: "ic",
          department: "Ops",
        },
      ]),
    );
  });

  async function nudgeRows() {
    return seedRow((tx) =>
      tx.select().from(auditLog).where(eq(auditLog.action, "nudge.sent")),
    );
  }

  it("writes a nudge.sent audit row scoped to tenant + user", async () => {
    const res = await asManager(TENANT_A, NMGR).sprint.nudge({
      sprintId: SPRINT_A,
      userId: NIC,
      channel: "email",
      body: "Just a friendly nudge.",
    });
    expect(res.ok).toBe(true);
    const rows = await nudgeRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].tenantId).toBe(TENANT_A);
    expect(rows[0].userId).toBe(NIC);
    expect(rows[0].targetId).toBe(SPRINT_A);
  });

  it("rejects a second nudge within 48h (cooldown)", async () => {
    await asManager(TENANT_A, NMGR).sprint.nudge({
      sprintId: SPRINT_A,
      userId: NIC,
      channel: "email",
      body: "First nudge.",
    });
    await expect(
      asManager(TENANT_A, NMGR).sprint.nudge({
        sprintId: SPRINT_A,
        userId: NIC,
        channel: "email",
        body: "Second nudge.",
      }),
    ).rejects.toThrow();
    expect(await nudgeRows()).toHaveLength(1);
  });

  it("rejects an IC session", async () => {
    await expect(
      asIc(TENANT_A, NIC).sprint.nudge({
        sprintId: SPRINT_A,
        userId: NIC,
        channel: "email",
        body: "x",
      }),
    ).rejects.toThrow();
  });

  it("is cross-tenant rejected (B manager cannot nudge an A user)", async () => {
    const MGRB = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeb0ff";
    await seedRow((tx) =>
      tx.insert(users).values({
        id: MGRB,
        tenantId: TENANT_B,
        email: "nmb@b.example",
        name: "MgrB",
        role: "manager",
        department: "Ops",
      }),
    );
    await expect(
      asManager(TENANT_B, MGRB).sprint.nudge({
        sprintId: SPRINT_A,
        userId: NIC,
        channel: "email",
        body: "x",
      }),
    ).rejects.toThrow();
    expect(await nudgeRows()).toHaveLength(0);
  });
});

describe("sprint lifecycle — close / update / currentForTenant", () => {
  it("close flips status to completed and stamps closedAt", async () => {
    await asTenant(TENANT_A).sprint.close({ id: SPRINT_A });
    const rows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(sprints).where(eq(sprints.id, SPRINT_A)),
    );
    expect(rows[0].status).toBe("completed");
    expect(rows[0].closedAt).not.toBeNull();
  });

  it("close is cross-tenant rejected (B cannot close A's sprint)", async () => {
    await expect(
      asTenant(TENANT_B).sprint.close({ id: SPRINT_A }),
    ).rejects.toThrow();
    const rows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(sprints).where(eq(sprints.id, SPRINT_A)),
    );
    expect(rows[0].status).toBe("active");
  });

  it("close rejects an IC session", async () => {
    await expect(
      asIc(TENANT_A, IC_A1).sprint.close({ id: SPRINT_A }),
    ).rejects.toThrow();
  });

  it("currentForTenant excludes completed sprints", async () => {
    expect(await asTenant(TENANT_A).sprint.currentForTenant()).toBe(SPRINT_A);
    await asTenant(TENANT_A).sprint.close({ id: SPRINT_A });
    expect(await asTenant(TENANT_A).sprint.currentForTenant()).toBeNull();
  });

  it("update edits name and primaryFocus", async () => {
    await asTenant(TENANT_A).sprint.update({
      id: SPRINT_A,
      name: "Renamed Sprint",
      primaryFocus: "Quote-to-cash",
    });
    const rows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(sprints).where(eq(sprints.id, SPRINT_A)),
    );
    expect(rows[0].name).toBe("Renamed Sprint");
    expect(rows[0].primaryFocus).toBe("Quote-to-cash");
  });

  it("update is cross-tenant rejected", async () => {
    await expect(
      asTenant(TENANT_B).sprint.update({ id: SPRINT_A, name: "Hijacked" }),
    ).rejects.toThrow();
    const rows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(sprints).where(eq(sprints.id, SPRINT_A)),
    );
    expect(rows[0].name).toBe("S");
  });

  it("update rejects an IC session", async () => {
    await expect(
      asIc(TENANT_A, IC_A1).sprint.update({ id: SPRINT_A, name: "Nope" }),
    ).rejects.toThrow();
  });
});

describe("sprint.progress — captures scoped to the sprint", () => {
  // Two sprints in the SAME tenant. RLS scopes to tenant; the captures count
  // must additionally scope to the queried sprint via sessions.sprintId.
  const SPR_OTHER = "dddddddd-dddd-4ddd-8ddd-dddddddd0010";
  const CAP_IC = "dddddddd-dddd-4ddd-8ddd-dddddddd0001";
  const SES_IN_A = "dddddddd-dddd-4ddd-8ddd-dddddddd0a01";
  const SES_IN_OTHER = "dddddddd-dddd-4ddd-8ddd-dddddddd0b01";

  function captureRow(sessionId: string, summary: string) {
    return {
      tenantId: TENANT_A,
      sessionId,
      userId: CAP_IC,
      kind: "friction",
      summary,
      sourceQuote: "q",
    };
  }

  beforeEach(async () => {
    await seedRow((tx) =>
      tx.insert(users).values({
        id: CAP_IC,
        tenantId: TENANT_A,
        email: "cap@a.example",
        name: "Cap IC",
        role: "ic",
        department: "Ops",
      }),
    );
    await seedRow((tx) =>
      tx.insert(sprints).values(sprintRow(SPR_OTHER, TENANT_A)),
    );
    // SPRINT_A (outer beforeEach) gets one session with 2 captures;
    // SPR_OTHER gets one session with 3 captures — same tenant.
    await seedRow((tx) =>
      tx.insert(sessions).values([
        {
          id: SES_IN_A,
          tenantId: TENANT_A,
          sprintId: SPRINT_A,
          userId: CAP_IC,
          status: "completed",
        },
        {
          id: SES_IN_OTHER,
          tenantId: TENANT_A,
          sprintId: SPR_OTHER,
          userId: CAP_IC,
          status: "completed",
        },
      ]),
    );
    await seedRow((tx) =>
      tx
        .insert(captures)
        .values([
          captureRow(SES_IN_A, "a1"),
          captureRow(SES_IN_A, "a2"),
          captureRow(SES_IN_OTHER, "o1"),
          captureRow(SES_IN_OTHER, "o2"),
          captureRow(SES_IN_OTHER, "o3"),
        ]),
    );
  });

  it("counts only the queried sprint's captures, not all tenant captures", async () => {
    const api = asTenant(TENANT_A);
    const a = await api.sprint.progress({ id: SPRINT_A });
    expect(a.capturesCount).toBe(2);
    const other = await api.sprint.progress({ id: SPR_OTHER });
    expect(other.capturesCount).toBe(3);
  });
});

describe("sprint.get — sponsor/manager attribution", () => {
  const SPONSOR = "cccccccc-cccc-4ccc-8ccc-cccccccc0001";
  const MANAGER = "cccccccc-cccc-4ccc-8ccc-cccccccc0002";
  const SPR = "cccccccc-cccc-4ccc-8ccc-cccccccc0010";

  beforeEach(async () => {
    await seedRow((tx) =>
      tx.insert(users).values([
        {
          id: SPONSOR,
          tenantId: TENANT_A,
          email: "sp@a.example",
          name: "Dana Sponsor",
          role: "sponsor",
          department: "Executive",
          title: "COO",
        },
        {
          id: MANAGER,
          tenantId: TENANT_A,
          email: "mg@a.example",
          name: "Marc Manager",
          role: "manager",
          department: "Ops",
          title: "VP Operations",
        },
      ]),
    );
    await seedRow((tx) =>
      tx.insert(sprints).values({
        id: SPR,
        tenantId: TENANT_A,
        name: "S2",
        primaryFocus: "ops",
        startDate: "2026-05-18",
        endDate: "2026-06-12",
        cadence: "weekly",
        status: "active",
        managerId: MANAGER,
        sponsorId: SPONSOR,
      }),
    );
  });

  it("resolves sponsor/manager even when they are not participants", async () => {
    const s = await asManager(TENANT_A, MANAGER).sprint.get({ id: SPR });
    expect(s.sponsor.name).toBe("Dana Sponsor");
    expect(s.sponsor.title).toBe("COO");
    expect(s.manager.name).toBe("Marc Manager");
  });
});
