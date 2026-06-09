import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { sprints } from "./schema";
import {
  asUser,
  seedRow,
  resetDb,
  seedTenants,
  TENANT_A,
  TENANT_B,
} from "./test/helpers";

const SPRINT_A = {
  tenantId: TENANT_A,
  name: "Secret Sprint A",
  primaryFocus: "ops",
  startDate: "2026-05-18",
  endDate: "2026-06-12",
  cadence: "weekly",
  status: "active",
};

beforeEach(async () => {
  await resetDb();
  await seedTenants();
  await seedRow((tx) => tx.insert(sprints).values(SPRINT_A));
});

describe("sprints — tenant isolation", () => {
  it("tenant A reads its sprint (positive control)", async () => {
    const rows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(sprints),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Secret Sprint A");
  });

  it("tenant B cannot read tenant A sprints", async () => {
    const rows = await asUser({ tenantId: TENANT_B }, (tx) =>
      tx.select().from(sprints),
    );
    expect(rows).toHaveLength(0);
  });

  it("tenant B cannot insert a sprint tagged tenant A", async () => {
    await expect(
      asUser({ tenantId: TENANT_B }, (tx) =>
        tx.insert(sprints).values({ ...SPRINT_A, name: "Evil" }),
      ),
    ).rejects.toThrow();
  });

  it("tenant B cannot update or delete tenant A sprints", async () => {
    const upd = await asUser({ tenantId: TENANT_B }, (tx) =>
      tx
        .update(sprints)
        .set({ name: "hacked" })
        .where(eq(sprints.name, "Secret Sprint A")),
    );
    expect(upd.count ?? 0).toBe(0);
    const del = await asUser({ tenantId: TENANT_B }, (tx) =>
      tx.delete(sprints).where(eq(sprints.name, "Secret Sprint A")),
    );
    expect(del.count ?? 0).toBe(0);
    const intact = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(sprints),
    );
    expect(intact).toHaveLength(1);
    expect(intact[0].name).toBe("Secret Sprint A");
  });
});
