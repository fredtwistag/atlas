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
