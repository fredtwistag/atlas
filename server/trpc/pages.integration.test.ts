import { describe, it, expect, beforeEach } from "vitest";
import { createCallerFactory } from "./trpc";
import { appRouter } from "./routers/_app";
import {
  tenants,
  sprints,
  opportunities,
  users,
  topics,
  sprintParticipants,
  sessions,
  invitations,
  sowDrafts,
} from "@/db/schema";
import { seedRow, resetDb, seedTenants, TENANT_A } from "@/db/test/helpers";

/**
 * Page data-contract tests: each protected page is an async Server Component
 * that fetches through getApi() (the same caller this exercises). These assert
 * the procedures behind /me and /sprint/[id] return exactly the render contract
 * those pages consume, against seeded RLS data.
 */
const createCaller = createCallerFactory(appRouter);
const asIc = (userId: string) =>
  createCaller({
    session: { kind: "tenant", tenantId: TENANT_A, userId, role: "ic" },
  });
const asManager = (userId: string) =>
  createCaller({
    session: { kind: "tenant", tenantId: TENANT_A, userId, role: "manager" },
  });

const SPRINT = "12121212-1212-4121-8121-121212120001";
const IC = "12121212-1212-4121-8121-1212121200a1";
const MGR = "12121212-1212-4121-8121-1212121200f1";
const T1 = "12121212-1212-4121-8121-1212121200d1";
const T2 = "12121212-1212-4121-8121-1212121200d2";
const SES1 = "12121212-1212-4121-8121-1212121200e1";
const SES2 = "12121212-1212-4121-8121-1212121200e2";

beforeEach(async () => {
  await resetDb();
  await seedTenants();
  await seedRow((tx) =>
    tx.insert(users).values([
      {
        id: IC,
        tenantId: TENANT_A,
        email: "ic@a.example",
        name: "Ivy Chen",
        role: "ic",
        department: "Ops",
      },
      {
        id: MGR,
        tenantId: TENANT_A,
        email: "mgr@a.example",
        name: "Mara Singh",
        role: "manager",
        department: "Ops",
      },
    ]),
  );
  await seedRow((tx) =>
    tx.insert(sprints).values({
      id: SPRINT,
      tenantId: TENANT_A,
      name: "Ops Discovery",
      primaryFocus: "Quote-to-cash",
      startDate: "2026-05-18",
      endDate: "2026-06-12",
      cadence: "weekly",
      status: "active",
      managerId: MGR,
    }),
  );
  await seedRow((tx) =>
    tx.insert(topics).values([
      {
        id: T1,
        tenantId: TENANT_A,
        sprintId: SPRINT,
        title: "How work flows",
        description: "The day-to-day path of a request.",
        orderIdx: 1,
        questionCount: 5,
        estMinutes: 6,
      },
      {
        id: T2,
        tenantId: TENANT_A,
        sprintId: SPRINT,
        title: "When things break",
        description: "Where it stalls.",
        orderIdx: 2,
        questionCount: 4,
        estMinutes: 5,
      },
    ]),
  );
  await seedRow((tx) =>
    tx.insert(sprintParticipants).values({
      tenantId: TENANT_A,
      sprintId: SPRINT,
      userId: IC,
      status: "in_progress",
      sessionsCompleted: 1,
      sessionsTotal: 2,
    }),
  );
});

describe("/me page contract — session.myDashboard", () => {
  beforeEach(async () => {
    await seedRow((tx) =>
      tx.insert(sessions).values([
        {
          id: SES1,
          tenantId: TENANT_A,
          sprintId: SPRINT,
          topicId: T1,
          userId: IC,
          status: "completed",
          captureCount: 3,
          totalSeconds: 360,
          completedAt: new Date("2026-05-20T10:00:00Z"),
          editWindowEndsAt: new Date("2026-05-27T10:00:00Z"),
        },
        {
          id: SES2,
          tenantId: TENANT_A,
          sprintId: SPRINT,
          topicId: T2,
          userId: IC,
          status: "not_started",
        },
      ]),
    );
  });

  it("returns the IC's sprint, ordered sessions, and the completed-session detail", async () => {
    const data = await asIc(IC).session.myDashboard();
    expect(data).not.toBeNull();
    expect(data!.sprintName).toBe("Ops Discovery");
    expect(data!.tenantName).toBe("Tenant A");

    // Ordered by topic orderIdx.
    expect(data!.sessions.map((s) => s.topicTitle)).toEqual([
      "How work flows",
      "When things break",
    ]);

    const completed = data!.sessions.find((s) => s.status === "completed")!;
    expect(completed.captureCount).toBe(3);
    expect(completed.totalSeconds).toBe(360);
    expect(completed.completedAt).not.toBe(""); // formatted, render-ready
    expect(completed.editWindowEndsAt).not.toBe("");
    expect(completed.topicDescription).toBe(
      "The day-to-day path of a request.",
    );

    const next = data!.sessions.find((s) => s.status !== "completed")!;
    expect(next.topicTitle).toBe("When things break");
    expect(next.estMinutes).toBe(5);
  });

  it("returns null when the user is in no active sprint (empty state)", async () => {
    const stranger = "12121212-1212-4121-8121-1212121200c9";
    await seedRow((tx) =>
      tx.insert(users).values({
        id: stranger,
        tenantId: TENANT_A,
        email: "no@a.example",
        name: "Noa",
        role: "ic",
        department: "Ops",
      }),
    );
    expect(await asIc(stranger).session.myDashboard()).toBeNull();
  });
});

describe("/sprint/[id] page contract — get + progress + activity + opportunities", () => {
  beforeEach(async () => {
    function oppRow(title: string, composite: string, confidence: number) {
      return {
        tenantId: TENANT_A,
        sprintId: SPRINT,
        title,
        description: "d",
        category: "c",
        impactLow: 100_000,
        impactHigh: 200_000,
        timeToShipWeeksLow: 2,
        timeToShipWeeksHigh: 4,
        confidenceScore: confidence,
        compositeScore: composite,
        dimensionScores: [],
        rationale: "r",
        status: "surfaced",
      };
    }
    await seedRow((tx) =>
      tx
        .insert(opportunities)
        .values([
          oppRow("Lower-scored", "6.0", 4),
          oppRow("Top-scored", "9.1", 5),
        ]),
    );
  });

  it("assembles a coherent dashboard payload the page renders", async () => {
    const api = asManager(MGR);
    const [sprint, progress, opps] = await Promise.all([
      api.sprint.get({ id: SPRINT }),
      api.sprint.progress({ id: SPRINT }),
      api.opportunity.listForSprint({ sprintId: SPRINT }),
    ]);

    expect(sprint.name).toBe("Ops Discovery");
    expect(sprint.manager.name).toBe("Mara Singh");

    expect(progress.opportunitiesCount).toBe(2);
    expect(progress.participantCount).toBeGreaterThanOrEqual(1);

    // Opportunities are ranked by composite score (highest first).
    expect(opps.map((o) => o.title)).toEqual(["Top-scored", "Lower-scored"]);
  });
});

const asTwistag = () =>
  createCaller({
    session: {
      kind: "twistag",
      twistagRole: "twistag_admin",
      userId: "00000000-0000-4000-8000-0000000000ff",
    },
  });

describe("/admin/clients/[tenantId]/sprint/[sprintId]/report contract — twistag.sprintView", () => {
  it("returns tenantId + render-ready sprint/progress/opportunities", async () => {
    const data = await asTwistag().twistag.sprintView({ sprintId: SPRINT });
    // The admin report route verifies this against the URL tenant.
    expect(data.tenantId).toBe(TENANT_A);
    expect(data.sprint.name).toBe("Ops Discovery");
    expect(data.sprint.startDate).not.toBe(""); // formatted
    expect(typeof data.progress.completionPct).toBe("number");
    expect(data.progress.participantCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(data.opportunities)).toBe(true);
  });
});

describe("/admin/clients/[tenantId] contract — twistag.clientDetail", () => {
  // A valid-UUID tenant (the TENANT_A/B fixtures aren't valid versioned UUIDs,
  // which the strict z.uuid() input rejects).
  const TC = "abababab-abab-4bab-8bab-abababab0001";
  const SC = "abababab-abab-4bab-8bab-abababab0002";
  const MC = "abababab-abab-4bab-8bab-abababab0003";
  const OC = "abababab-abab-4bab-8bab-abababab0004";

  beforeEach(async () => {
    await seedRow((tx) =>
      tx.insert(tenants).values({
        id: TC,
        slug: "client-c",
        name: "Client C",
        segment: "PE portco · 100-day",
        status: "onboarding",
      }),
    );
    await seedRow((tx) =>
      tx.insert(sprints).values({
        id: SC,
        tenantId: TC,
        name: "Revenue Ops Discovery",
        primaryFocus: "Quote-to-cash",
        startDate: "2026-05-18",
        endDate: "2026-06-12",
        cadence: "weekly",
        status: "active",
      }),
    );
    await seedRow((tx) =>
      tx.insert(users).values({
        id: MC,
        tenantId: TC,
        email: "mgr@c.example",
        name: "Cory Vale",
        role: "manager",
      }),
    );
    await seedRow((tx) =>
      tx.insert(sprintParticipants).values({
        tenantId: TC,
        sprintId: SC,
        userId: MC,
        status: "in_progress",
        sessionsCompleted: 3,
        sessionsTotal: 6,
      }),
    );
    await seedRow((tx) =>
      tx.insert(opportunities).values({
        id: OC,
        tenantId: TC,
        sprintId: SC,
        title: "Automate credit-hold release",
        description: "d",
        category: "c",
        impactLow: 100_000,
        impactHigh: 200_000,
        timeToShipWeeksLow: 2,
        timeToShipWeeksHigh: 4,
        confidenceScore: 5,
        compositeScore: "8.4",
        dimensionScores: [],
        rationale: "r",
        status: "approved",
      }),
    );
    await seedRow((tx) =>
      tx.insert(sowDrafts).values({
        tenantId: TC,
        opportunityId: OC,
        sprintId: SC,
        title: "SOW",
        scope: "s",
        team: [],
        durationWeeks: 4,
        priceUsd: 50_000,
        status: "draft",
      }),
    );
    await seedRow((tx) =>
      tx.insert(invitations).values({
        tenantId: TC,
        email: "new@c.example",
        role: "ic",
        status: "pending",
        invitedByKind: "twistag",
      }),
    );
  });

  it("returns the exact render contract the drill-down consumes", async () => {
    const detail = await asTwistag().twistag.clientDetail({ tenantId: TC });

    expect(detail.tenant).toMatchObject({
      name: "Client C",
      segment: "PE portco · 100-day",
      status: "onboarding",
    });
    expect(detail.members.map((m) => m.email)).toContain("mgr@c.example");
    expect(detail.pendingInvitations.map((i) => i.email)).toContain(
      "new@c.example",
    );

    expect(detail.sprints).toHaveLength(1);
    const s = detail.sprints[0];
    expect(s.completionPct).toBe(50);
    expect(s.participantCount).toBe(1);
    expect(s.opportunityCount).toBe(1);
    expect(s.approvedCount).toBe(1);
    expect(s.sowDraftStatuses).toEqual(["draft"]);

    expect(detail.opportunities).toHaveLength(1);
    const o = detail.opportunities[0];
    expect(o.title).toBe("Automate credit-hold release");
    expect(o.compositeScore).toBe(8.4);
    expect(o.status).toBe("approved");
    expect(o.sowStatus).toBe("draft");
  });
});
