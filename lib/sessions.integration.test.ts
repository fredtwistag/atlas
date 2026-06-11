import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq, and } from "drizzle-orm";
import {
  sprints,
  users,
  topics,
  sessions,
  sessionMessages,
  sprintParticipants,
  captures,
} from "@/db/schema";
import {
  asUser,
  seedRow,
  resetDb,
  seedTenants,
  TENANT_A,
} from "@/db/test/helpers";

// Mock the extraction sweep so completion is deterministic and offline.
const extractFromSession = vi.fn();
vi.mock("@/services/conversation/extract", () => ({
  extractFromSession: (...args: unknown[]) => extractFromSession(...args),
}));

// Plan 020: by default completion EMITS `session/completed` (extraction runs in
// the worker). Mock `inngest.send` so the default path doesn't touch the network
// and we can assert the emit. Tests that exercise the INLINE fallback set
// ATLAS_INLINE_SESSION_EXTRACTION=1 (see below).
const inngestSend = vi.fn(async (..._a: unknown[]) => ({ ids: [] as string[] }));
vi.mock("@/services/jobs/client", async (orig) => {
  const actual = await orig<typeof import("@/services/jobs/client")>();
  return {
    ...actual,
    inngest: { ...actual.inngest, send: (...a: unknown[]) => inngestSend(...a) },
  };
});

import { completeSessionForUser } from "./sessions";

const USER = "66666666-6666-4666-8666-66666666a001";
const OTHER = "66666666-6666-4666-8666-66666666a002";
const SPRINT = "66666666-6666-4666-8666-66666666a010";
const TOPIC = "66666666-6666-4666-8666-66666666a020";
const SES = "66666666-6666-4666-8666-66666666a030";

beforeEach(async () => {
  extractFromSession.mockReset();
  extractFromSession.mockResolvedValue([]);
  inngestSend.mockClear();
  delete process.env.ATLAS_INLINE_SESSION_EXTRACTION;
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

  it("sets editWindowEndsAt to ~7 days after completion", async () => {
    const before = Date.now();
    await completeSessionForUser(
      { tenantId: TENANT_A, userId: USER, role: "ic" },
      SES,
    );

    const [ses] = await asUser({ tenantId: TENANT_A, userId: USER }, (tx) =>
      tx.select().from(sessions).where(eq(sessions.id, SES)),
    );
    const completedAt = ses.completedAt!.getTime();
    const windowMs = ses.editWindowEndsAt!.getTime() - completedAt;
    // 7 days, within a generous tolerance.
    expect(Math.abs(windowMs - 7 * 86_400_000)).toBeLessThan(5000);
    expect(completedAt).toBeGreaterThanOrEqual(before - 1000);
  });

  it("stamps totalSeconds from the transcript span", async () => {
    // Seed two messages 90s apart.
    const t0 = new Date("2026-06-10T10:00:00Z");
    const t1 = new Date("2026-06-10T10:01:30Z");
    await seedRow((tx) =>
      tx.insert(sessionMessages).values([
        {
          tenantId: TENANT_A,
          sessionId: SES,
          userId: USER,
          role: "assistant",
          content: "Opening question.",
          arc: "INTRO",
          createdAt: t0,
        },
        {
          tenantId: TENANT_A,
          sessionId: SES,
          userId: USER,
          role: "user",
          content: "Here's the workflow.",
          arc: "ARC_1",
          createdAt: t1,
        },
      ]),
    );

    await completeSessionForUser(
      { tenantId: TENANT_A, userId: USER, role: "ic" },
      SES,
    );

    const [ses] = await asUser({ tenantId: TENANT_A, userId: USER }, (tx) =>
      tx.select().from(sessions).where(eq(sessions.id, SES)),
    );
    expect(ses.totalSeconds).toBe(90);
  });

  it("inline fallback: runs the final extraction sweep, dedupes by summary, and bumps captureCount", async () => {
    // Exercise the inline path (pre-020 behavior) via the fallback flag.
    process.env.ATLAS_INLINE_SESSION_EXTRACTION = "1";
    // One capture already on the session (mimics a per-turn pass).
    await seedRow((tx) =>
      tx.insert(captures).values({
        tenantId: TENANT_A,
        sessionId: SES,
        userId: USER,
        kind: "bottleneck",
        summary: "Re-keys the quote by hand.",
        sourceQuote: "I re-key the quote by hand",
      }),
    );

    // Final sweep returns a duplicate (same summary, different case) + a new one.
    extractFromSession.mockResolvedValue([
      {
        kind: "bottleneck",
        summary: "RE-KEYS THE QUOTE BY HAND.",
        sourceQuote: "I re-key the quote by hand",
        tags: [],
      },
      {
        kind: "handoff",
        summary: "Escalates to finance on Slack.",
        sourceQuote: "we escalate to finance on Slack",
        tags: [],
      },
    ]);

    await completeSessionForUser(
      { tenantId: TENANT_A, userId: USER, role: "ic" },
      SES,
    );

    const rows = await asUser({ tenantId: TENANT_A, userId: USER }, (tx) =>
      tx.select().from(captures).where(eq(captures.sessionId, SES)),
    );
    // 1 pre-existing + 1 new (the duplicate was dropped) = 2.
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.kind === "handoff")).toHaveLength(1);

    const [ses] = await asUser({ tenantId: TENANT_A, userId: USER }, (tx) =>
      tx.select().from(sessions).where(eq(sessions.id, SES)),
    );
    // captureCount bumped by the 1 new row only.
    expect(ses.captureCount).toBe(1);
  });

  it("inline fallback: completion still succeeds when the final extraction throws", async () => {
    process.env.ATLAS_INLINE_SESSION_EXTRACTION = "1";
    const { LlmOutputError } = await import("@/services/llm/client");
    extractFromSession.mockRejectedValue(new LlmOutputError("bad json"));

    await completeSessionForUser(
      { tenantId: TENANT_A, userId: USER, role: "ic" },
      SES,
    );

    const [ses] = await asUser({ tenantId: TENANT_A, userId: USER }, (tx) =>
      tx.select().from(sessions).where(eq(sessions.id, SES)),
    );
    expect(ses.status).toBe("completed");
  });

  it("default path: emits session/completed and does NOT run extraction inline", async () => {
    extractFromSession.mockResolvedValue([
      { kind: "handoff", summary: "x", sourceQuote: "x", tags: [] },
    ]);

    await completeSessionForUser(
      { tenantId: TENANT_A, userId: USER, role: "ic" },
      SES,
    );

    // The inline sweep did NOT run (it lives in the worker now).
    expect(extractFromSession).not.toHaveBeenCalled();
    // The event was emitted with the session + tenant ids.
    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "session/completed",
        data: expect.objectContaining({ sessionId: SES, tenantId: TENANT_A }),
      }),
    );
    const rows = await asUser({ tenantId: TENANT_A, userId: USER }, (tx) =>
      tx.select().from(captures).where(eq(captures.sessionId, SES)),
    );
    expect(rows).toHaveLength(0);
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
