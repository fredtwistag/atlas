import { describe, it, expect, beforeEach } from "vitest";
import { sprints, users, sessions } from "./schema";
import {
  asUser,
  seedRow,
  resetDb,
  seedTenants,
  TENANT_A,
  TENANT_B,
} from "./test/helpers";

const USER_ID = "22222222-2222-2222-2222-2222222222a1";
const SPRINT_ID = "11111111-1111-1111-1111-1111111111a2";

beforeEach(async () => {
  await resetDb();
  await seedTenants();
  await seedRow((tx) =>
    tx.insert(users).values({
      id: USER_ID,
      tenantId: TENANT_A,
      email: "ic@a.example",
      name: "IC A",
      role: "ic",
    }),
  );
  await seedRow((tx) =>
    tx.insert(sprints).values({
      id: SPRINT_ID,
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
      tenantId: TENANT_A,
      sprintId: SPRINT_ID,
      userId: USER_ID,
      status: "completed",
    }),
  );
});

describe("sessions — tenant isolation", () => {
  it("tenant A reads its session", async () => {
    const rows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(sessions),
    );
    expect(rows).toHaveLength(1);
  });

  it("tenant B reads none", async () => {
    const rows = await asUser({ tenantId: TENANT_B }, (tx) =>
      tx.select().from(sessions),
    );
    expect(rows).toHaveLength(0);
  });

  it("tenant B cannot insert tagged tenant A", async () => {
    await expect(
      asUser({ tenantId: TENANT_B }, (tx) =>
        tx.insert(sessions).values({
          tenantId: TENANT_A,
          sprintId: SPRINT_ID,
          userId: USER_ID,
          status: "completed",
        }),
      ),
    ).rejects.toThrow();
  });
});
