import { describe, it, expect, beforeEach } from "vitest";
import { users, sprints, sessions, sessionMessages } from "./schema";
import {
  asUser,
  seedRow,
  resetDb,
  seedTenants,
  TENANT_A,
  TENANT_B,
} from "./test/helpers";

// Tenant A: an IC who owns the session + transcript, and a manager in the SAME
// tenant who must NOT be able to read it.
const IC_A = "22222222-2222-4222-8222-2222222222a1";
const MGR_A = "22222222-2222-4222-8222-2222222222a2";
const SPRINT_A = "33333333-3333-4333-8333-3333333333a1";
const SESSION_A = "44444444-4444-4444-8444-44444444a001";

beforeEach(async () => {
  await resetDb();
  await seedTenants();
  await seedRow((tx) =>
    tx.insert(users).values([
      {
        id: IC_A,
        tenantId: TENANT_A,
        email: "ic@a.example",
        name: "IC A",
        role: "ic",
        department: "Ops",
      },
      {
        id: MGR_A,
        tenantId: TENANT_A,
        email: "mgr@a.example",
        name: "Mgr A",
        role: "manager",
        department: "Ops",
      },
    ]),
  );
  await seedRow((tx) =>
    tx.insert(sprints).values({
      id: SPRINT_A,
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
    tx.insert(sessions).values({
      id: SESSION_A,
      tenantId: TENANT_A,
      sprintId: SPRINT_A,
      userId: IC_A,
      status: "in_progress",
    }),
  );
  await seedRow((tx) =>
    tx.insert(sessionMessages).values([
      {
        tenantId: TENANT_A,
        sessionId: SESSION_A,
        userId: IC_A,
        role: "assistant",
        content: "A private question only the IC should ever read.",
        arc: "ARC_1",
      },
      {
        tenantId: TENANT_A,
        sessionId: SESSION_A,
        userId: IC_A,
        role: "user",
        content: "A private answer the manager must never see.",
        arc: "ARC_1",
      },
    ]),
  );
});

describe("session_messages — tenant isolation", () => {
  it("the owning IC reads their own transcript", async () => {
    const rows = await asUser({ tenantId: TENANT_A, userId: IC_A }, (tx) =>
      tx.select().from(sessionMessages),
    );
    expect(rows).toHaveLength(2);
  });

  it("tenant B reads none (cross-tenant → 0 rows)", async () => {
    const rows = await asUser({ tenantId: TENANT_B, userId: IC_A }, (tx) =>
      tx.select().from(sessionMessages),
    );
    expect(rows).toHaveLength(0);
  });

  it("tenant B cannot insert a row tagged tenant A", async () => {
    await expect(
      asUser({ tenantId: TENANT_B, userId: IC_A }, (tx) =>
        tx.insert(sessionMessages).values({
          tenantId: TENANT_A,
          sessionId: SESSION_A,
          userId: IC_A,
          role: "user",
          content: "evil cross-tenant write",
          arc: "ARC_1",
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("session_messages — owner-only read (privacy by design)", () => {
  it("a same-tenant MANAGER cannot read the IC's transcript → 0 rows", async () => {
    const rows = await asUser(
      { tenantId: TENANT_A, userId: MGR_A, role: "manager" },
      (tx) => tx.select().from(sessionMessages),
    );
    expect(rows).toHaveLength(0);
  });

  it("a different same-tenant IC cannot read another IC's transcript → 0 rows", async () => {
    const OTHER_IC = "22222222-2222-4222-8222-2222222222a3";
    await seedRow((tx) =>
      tx.insert(users).values({
        id: OTHER_IC,
        tenantId: TENANT_A,
        email: "ic2@a.example",
        name: "IC A2",
        role: "ic",
        department: "Ops",
      }),
    );
    const rows = await asUser(
      { tenantId: TENANT_A, userId: OTHER_IC },
      (tx) => tx.select().from(sessionMessages),
    );
    expect(rows).toHaveLength(0);
  });
});
