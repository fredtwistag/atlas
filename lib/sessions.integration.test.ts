import { describe, it, expect, beforeEach } from "vitest";
import { eq, and } from "drizzle-orm";
import {
  sprints,
  users,
  topics,
  sessions,
  sprintParticipants,
} from "@/db/schema";
import {
  asUser,
  seedRow,
  resetDb,
  seedTenants,
  TENANT_A,
} from "@/db/test/helpers";
import { completeSessionForUser } from "./sessions";

const USER = "66666666-6666-4666-8666-66666666a001";
const OTHER = "66666666-6666-4666-8666-66666666a002";
const SPRINT = "66666666-6666-4666-8666-66666666a010";
const TOPIC = "66666666-6666-4666-8666-66666666a020";
const SES = "66666666-6666-4666-8666-66666666a030";

beforeEach(async () => {
  await resetDb();
  await seedTenants();
  await seedRow((tx) =>
    tx.insert(users).values([
      {
        id: USER,
        tenantId: TENANT_A,
        email: "u@a.example",
        name: "U",
        role: "ic",
        department: "Ops",
      },
      {
        id: OTHER,
        tenantId: TENANT_A,
        email: "o@a.example",
        name: "O",
        role: "ic",
        department: "Ops",
      },
    ]),
  );
  await seedRow((tx) =>
    tx.insert(sprints).values({
      id: SPRINT,
      tenantId: TENANT_A,
      name: "S",
      primaryFocus: "ops",
      startDate: "2026-05-18",
      endDate: "2026-06-12",
      cadence: "weekly",
      status: "active",
    }),
  );
  await seedRow((tx) =>
    tx.insert(topics).values({
      id: TOPIC,
      tenantId: TENANT_A,
      sprintId: SPRINT,
      title: "T",
      description: "d",
      orderIdx: 1,
      questionCount: 3,
      estMinutes: 5,
    }),
  );
  await seedRow((tx) =>
    tx.insert(sprintParticipants).values({
      tenantId: TENANT_A,
      sprintId: SPRINT,
      userId: USER,
      status: "not_started",
      sessionsCompleted: 0,
      sessionsTotal: 1,
    }),
  );
  await seedRow((tx) =>
    tx.insert(sessions).values({
      id: SES,
      tenantId: TENANT_A,
      sprintId: SPRINT,
      topicId: TOPIC,
      userId: USER,
      status: "not_started",
    }),
  );
});

describe("completeSessionForUser", () => {
  it("marks the session complete and bumps participant progress", async () => {
    await completeSessionForUser(
      { tenantId: TENANT_A, userId: USER, role: "ic" },
      SES,
    );

    const [ses] = await asUser({ tenantId: TENANT_A, userId: USER }, (tx) =>
      tx.select().from(sessions).where(eq(sessions.id, SES)),
    );
    expect(ses.status).toBe("completed");
    expect(ses.completedAt).not.toBeNull();
    expect(ses.editWindowEndsAt).not.toBeNull();

    const [part] = await asUser({ tenantId: TENANT_A, userId: USER }, (tx) =>
      tx
        .select()
        .from(sprintParticipants)
        .where(
          and(
            eq(sprintParticipants.sprintId, SPRINT),
            eq(sprintParticipants.userId, USER),
          ),
        ),
    );
    expect(part.sessionsCompleted).toBe(1);
    expect(part.status).toBe("completed"); // 1 of 1 total
  });

  it("does not complete another user's session", async () => {
    await expect(
      completeSessionForUser(
        { tenantId: TENANT_A, userId: OTHER, role: "ic" },
        SES,
      ),
    ).rejects.toThrow();

    const [ses] = await asUser({ tenantId: TENANT_A, userId: USER }, (tx) =>
      tx.select().from(sessions).where(eq(sessions.id, SES)),
    );
    expect(ses.status).toBe("not_started");
  });
});
