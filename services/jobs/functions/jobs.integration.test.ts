import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq, and } from "drizzle-orm";

// Mock the email send so no Resend call happens. Default: succeeds (skipped
// shape). Individual tests override to assert the rollback-on-throw guarantee.
const sendEmailMock = vi.fn(async () => ({
  sent: false as const,
  skipped: true as const,
}));
vi.mock("@/services/email/send", () => ({
  sendEmail: (...a: unknown[]) => sendEmailMock(...(a as [])),
}));

// Mock the invite-link generator (it would hit Supabase admin otherwise).
vi.mock("@/services/email/invite-link", () => ({
  generateInviteLink: vi.fn(async (email: string) => `https://atlas.test/c/${email}`),
}));

// Mock the LLM extraction so the session-completion job runs deterministically.
const extractFromSessionMock = vi.fn(async () => [] as unknown[]);
vi.mock("@/services/conversation/extract", async (orig) => {
  const actual = await orig<typeof import("@/services/conversation/extract")>();
  return { ...actual, extractFromSession: (...a: unknown[]) => extractFromSessionMock(...(a as [])) };
});

import { runNudgeSend } from "./nudge-send";
import { loadInviteContext, sendInvite } from "./invite-send";
import { loadIdleIcs, sendIdleReminder } from "./reminders";
import { buildSprintDigest } from "./digests";
import { runRecompute, loadActiveSprints } from "./recompute";
import { runFinalExtractionForSession } from "@/lib/sessions";
import {
  tenants,
  sprints,
  users,
  topics,
  sprintParticipants,
  sessions,
  sessionMessages,
  captures,
  auditLog,
} from "@/db/schema";
import {
  seedRow,
  resetDb,
  seedTenants,
  withServiceRoleRaw,
  TENANT_A,
} from "@/db/test/helpers";

const SPRINT_A = "33333333-3333-4333-8333-3333333333a1";
const MGR = "44444444-4444-4444-8444-44444444a001";
const IC = "44444444-4444-4444-8444-44444444a002";

function sprintRow(id: string, tenantId: string, over: Record<string, unknown> = {}) {
  return {
    id,
    tenantId,
    name: "Ops Discovery",
    primaryFocus: "ops",
    startDate: "2026-05-18",
    endDate: "2026-06-12",
    cadence: "weekly",
    status: "active",
    managerId: MGR,
    ...over,
  };
}

async function auditRows(action: string) {
  return withServiceRoleRaw((tx) =>
    tx.select().from(auditLog).where(eq(auditLog.action, action)),
  );
}

beforeEach(async () => {
  await resetDb();
  await seedTenants();
  sendEmailMock.mockClear();
  sendEmailMock.mockResolvedValue({ sent: false, skipped: true });
  extractFromSessionMock.mockClear();
  extractFromSessionMock.mockResolvedValue([]);
  await seedRow((tx) =>
    tx.insert(users).values([
      {
        id: MGR,
        tenantId: TENANT_A,
        email: "mgr@a.example",
        name: "Mgr A",
        role: "manager",
        department: "Ops",
      },
      {
        id: IC,
        tenantId: TENANT_A,
        email: "ic@a.example",
        name: "IC One",
        role: "ic",
        department: "Finance",
      },
    ]),
  );
  await seedRow((tx) => tx.insert(sprints).values(sprintRow(SPRINT_A, TENANT_A)));
});

describe("runNudgeSend (Step 2 worker body)", () => {
  it("writes a nudge.sent audit row scoped to tenant+user and sends one email", async () => {
    const res = await runNudgeSend({
      tenantId: TENANT_A,
      sprintId: SPRINT_A,
      userId: IC,
      actorId: MGR,
      channel: "email",
      body: "Just a nudge.",
    });
    expect(res.ok).toBe(true);
    const rows = await auditRows("nudge.sent");
    expect(rows).toHaveLength(1);
    expect(rows[0].tenantId).toBe(TENANT_A);
    expect(rows[0].userId).toBe(IC);
    expect(rows[0].targetId).toBe(SPRINT_A);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("enforces the 48h per-recipient cooldown (second send is skipped, no 2nd audit)", async () => {
    await runNudgeSend({
      tenantId: TENANT_A,
      sprintId: SPRINT_A,
      userId: IC,
      actorId: MGR,
      channel: "email",
      body: "First.",
    });
    const second = await runNudgeSend({
      tenantId: TENANT_A,
      sprintId: SPRINT_A,
      userId: IC,
      actorId: MGR,
      channel: "email",
      body: "Second.",
    });
    expect(second.ok).toBe(false);
    expect(second.reason).toBe("cooldown");
    expect(await auditRows("nudge.sent")).toHaveLength(1);
    // The cooldown short-circuits before a second email.
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("ATOMICITY: a send failure rolls back the audit row (cooldown not burned)", async () => {
    sendEmailMock.mockRejectedValueOnce(new Error("Resend send failed"));
    await expect(
      runNudgeSend({
        tenantId: TENANT_A,
        sprintId: SPRINT_A,
        userId: IC,
        actorId: MGR,
        channel: "email",
        body: "Will fail.",
      }),
    ).rejects.toThrow();
    // The audit row written earlier in the same tx must be rolled back.
    expect(await auditRows("nudge.sent")).toHaveLength(0);

    // And a subsequent send (email now works) goes through — cooldown intact.
    const retry = await runNudgeSend({
      tenantId: TENANT_A,
      sprintId: SPRINT_A,
      userId: IC,
      actorId: MGR,
      channel: "email",
      body: "Retry.",
    });
    expect(retry.ok).toBe(true);
    expect(await auditRows("nudge.sent")).toHaveLength(1);
  });
});

describe("invite-send (Step 3 worker body)", () => {
  beforeEach(async () => {
    await seedRow((tx) =>
      tx.insert(topics).values({
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
      tx.insert(sprintParticipants).values([
        {
          tenantId: TENANT_A,
          sprintId: SPRINT_A,
          userId: IC,
          status: "not_started",
          sessionsCompleted: 0,
          sessionsTotal: 1,
        },
        {
          tenantId: TENANT_A,
          sprintId: SPRINT_A,
          userId: MGR,
          status: "not_started",
          sessionsCompleted: 0,
          sessionsTotal: 1,
        },
      ]),
    );
  });

  it("loads only IC participants, plus org/inviter/topics context", async () => {
    const ctx = await loadInviteContext({ sprintId: SPRINT_A, tenantId: TENANT_A });
    expect(ctx.ics.map((i) => i.email)).toEqual(["ic@a.example"]);
    expect(ctx.orgName).toBe("Tenant A");
    expect(ctx.inviterName).toBe("Mgr A");
    expect(ctx.topics).toEqual([{ title: "How work flows", estMinutes: 6 }]);
  });

  it("sends one invite email per IC", async () => {
    const ctx = await loadInviteContext({ sprintId: SPRINT_A, tenantId: TENANT_A });
    await sendInvite(ctx.ics[0], ctx);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });
});

describe("runFinalExtractionForSession (Step 4 worker body)", () => {
  const SES = "33333333-3333-4333-8333-3333333333f1";

  beforeEach(async () => {
    await seedRow((tx) =>
      tx.insert(topics).values({
        id: "33333333-3333-4333-8333-3333333333f0",
        tenantId: TENANT_A,
        sprintId: SPRINT_A,
        title: "Quote-to-cash",
        description: "d",
        orderIdx: 1,
        questionCount: 5,
        estMinutes: 6,
      }),
    );
    await seedRow((tx) =>
      tx.insert(sessions).values({
        id: SES,
        tenantId: TENANT_A,
        sprintId: SPRINT_A,
        topicId: "33333333-3333-4333-8333-3333333333f0",
        userId: IC,
        status: "completed",
      }),
    );
    await seedRow((tx) =>
      tx.insert(sessionMessages).values([
        {
          tenantId: TENANT_A,
          sessionId: SES,
          userId: IC,
          role: "user",
          content: "I re-key the quote by hand every cycle.",
          arc: "DIVE",
        },
      ]),
    );
  });

  it("persists newly-extracted captures and returns the sprintId", async () => {
    extractFromSessionMock.mockResolvedValue([
      {
        kind: "bottleneck",
        summary: "Re-keys the quote by hand.",
        sourceQuote: "I re-key the quote by hand",
        tags: ["manual"],
      },
    ]);
    const res = await runFinalExtractionForSession(SES, TENANT_A);
    expect(res?.sprintId).toBe(SPRINT_A);
    const caps = await withServiceRoleRaw((tx) =>
      tx.select().from(captures).where(eq(captures.sessionId, SES)),
    );
    expect(caps).toHaveLength(1);
    expect(caps[0].kind).toBe("bottleneck");
  });

  it("dedupes against existing captures (idempotent on re-run)", async () => {
    await seedRow((tx) =>
      tx.insert(captures).values({
        tenantId: TENANT_A,
        sessionId: SES,
        userId: IC,
        kind: "bottleneck",
        summary: "Re-keys the quote by hand.",
        sourceQuote: "q",
      }),
    );
    extractFromSessionMock.mockResolvedValue([
      {
        kind: "bottleneck",
        summary: "Re-keys the quote by hand.",
        sourceQuote: "I re-key the quote by hand",
        tags: [],
      },
    ]);
    await runFinalExtractionForSession(SES, TENANT_A);
    const caps = await withServiceRoleRaw((tx) =>
      tx.select().from(captures).where(eq(captures.sessionId, SES)),
    );
    expect(caps).toHaveLength(1); // no duplicate
  });

  it("returns null for a missing session", async () => {
    const res = await runFinalExtractionForSession(
      "33333333-3333-4333-8333-333333330000",
      TENANT_A,
    );
    expect(res).toBeNull();
  });
});

describe("runRecompute (Steps 4/6 — LLM-key guard)", () => {
  const ORIG = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    if (ORIG === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = ORIG;
  });

  it("skips silently when the LLM key is unset", async () => {
    const res = await runRecompute(SPRINT_A, TENANT_A);
    expect(res).toEqual({ ran: false, reason: "no_llm_key" });
  });

  it("loadActiveSprints returns only active sprints", async () => {
    await seedRow((tx) =>
      tx
        .insert(sprints)
        .values(
          sprintRow("33333333-3333-4333-8333-3333333333c1", TENANT_A, {
            status: "completed",
          }),
        ),
    );
    const active = await loadActiveSprints();
    const ids = active.map((s) => s.id);
    expect(ids).toContain(SPRINT_A);
    expect(ids).not.toContain("33333333-3333-4333-8333-3333333333c1");
  });
});

describe("reminders.ic.idle (Step 5 worker body)", () => {
  const SES = "33333333-3333-4333-8333-3333333333d1";

  beforeEach(async () => {
    await seedRow((tx) =>
      tx.insert(sprintParticipants).values({
        tenantId: TENANT_A,
        sprintId: SPRINT_A,
        userId: IC,
        status: "in_progress",
        sessionsCompleted: 0,
        sessionsTotal: 2,
      }),
    );
    await seedRow((tx) =>
      tx.insert(sessions).values({
        id: SES,
        tenantId: TENANT_A,
        sprintId: SPRINT_A,
        userId: IC,
        status: "not_started",
      }),
    );
  });

  it("finds an IC with an incomplete session in an active sprint", async () => {
    const idle = await loadIdleIcs();
    expect(idle.map((i) => i.userId)).toContain(IC);
  });

  it("send is atomic: audits reminder.ic.idle + emails, and suppresses re-reminders within 72h", async () => {
    const [ic] = await loadIdleIcs();
    await sendIdleReminder(ic);
    expect(await auditRows("reminder.ic.idle")).toHaveLength(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);

    // The 72h guard now skips this IC.
    const again = await loadIdleIcs();
    expect(again.map((i) => i.userId)).not.toContain(IC);
  });

  it("ATOMICITY: a failed send rolls back the reminder audit row", async () => {
    sendEmailMock.mockRejectedValueOnce(new Error("Resend send failed"));
    const [ic] = await loadIdleIcs();
    await expect(sendIdleReminder(ic)).rejects.toThrow();
    expect(await auditRows("reminder.ic.idle")).toHaveLength(0);
  });

  it("does not remind an IC who completed a session recently", async () => {
    await withServiceRoleRaw((tx) =>
      tx
        .update(sessions)
        .set({ status: "completed", completedAt: new Date() })
        .where(and(eq(sessions.id, SES), eq(sessions.userId, IC))),
    );
    // Now the IC has no incomplete sessions → not idle.
    const idle = await loadIdleIcs();
    expect(idle.map((i) => i.userId)).not.toContain(IC);
  });
});

describe("buildSprintDigest (Step 5 — dashboard-identical numbers)", () => {
  it("reads participation/captures/opportunities from the same source as the dashboard", async () => {
    await seedRow((tx) =>
      tx.insert(sprintParticipants).values({
        tenantId: TENANT_A,
        sprintId: SPRINT_A,
        userId: IC,
        status: "in_progress",
        sessionsCompleted: 2,
        sessionsTotal: 4,
      }),
    );
    const data = await buildSprintDigest(SPRINT_A, TENANT_A);
    expect(data).not.toBeNull();
    expect(data!.orgName).toBe("Tenant A");
    expect(data!.sprintName).toBe("Ops Discovery");
    // 2/4 sessions complete → 50% participation (computeProgress).
    expect(data!.participationPct).toBe(50);
    expect(typeof data!.capturesCount).toBe("number");
    expect(typeof data!.opportunitiesCount).toBe("number");
  });

  it("returns null for a sprint in another tenant", async () => {
    const data = await buildSprintDigest(SPRINT_A, "00000000-0000-0000-0000-00000000000b");
    expect(data).toBeNull();
  });
});
