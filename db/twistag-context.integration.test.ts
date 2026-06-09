import { describe, it, expect, beforeEach } from "vitest";
import { sprints } from "./schema";
import { withTwistagContext } from "./client";
import {
  asUser,
  seedRow,
  resetDb,
  seedTenants,
  TENANT_A,
  TENANT_B,
} from "./test/helpers";

const SPRINT_A = "77777777-7777-4777-8777-77777777a001";
const SPRINT_B = "77777777-7777-4777-8777-77777777b001";

function row(id: string, tenantId: string) {
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

beforeEach(async () => {
  await resetDb();
  await seedTenants();
  await seedRow((tx) => tx.insert(sprints).values(row(SPRINT_A, TENANT_A)));
  await seedRow((tx) => tx.insert(sprints).values(row(SPRINT_B, TENANT_B)));
});

describe("withTwistagContext", () => {
  it("reads sprints across all tenants", async () => {
    const rows = await withTwistagContext(
      {
        twistagRole: "twistag_admin",
        actor: "00000000-0000-4000-8000-0000000000ff",
      },
      (tx) => tx.select().from(sprints),
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it("a tenant context still reads only its own (control)", async () => {
    const rows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(sprints),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(SPRINT_A);
  });
});
