import { describe, it, expect, beforeEach } from "vitest";
import { desc, eq } from "drizzle-orm";
import { withServiceRole, withTwistagContext } from "./client";
import { auditLog } from "./schema";
import { resetDb, seedTenants, TENANT_A } from "./test/helpers";

const ACTOR = "00000000-0000-4000-8000-0000000000ff";

beforeEach(async () => {
  await resetDb();
  await seedTenants();
});

/** Read the most recent audit row for an action (service role). */
async function lastAudit(action: string) {
  return withServiceRole({ action: "test.read", actor: "test" }, async (tx) => {
    const [row] = await tx
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, action))
      .orderBy(desc(auditLog.id))
      .limit(1);
    return row;
  });
}

describe("audit enrichment", () => {
  it("withServiceRole fills tenant_id/user_id/target_id and merges metadata with actor", async () => {
    await withServiceRole(
      {
        action: "test.full",
        actor: ACTOR,
        tenantId: TENANT_A,
        userId: ACTOR,
        targetId: "tgt-123",
        metadata: { foo: "bar" },
      },
      async () => {},
    );
    const row = await lastAudit("test.full");
    expect(row.tenantId).toBe(TENANT_A);
    expect(row.userId).toBe(ACTOR);
    expect(row.targetId).toBe("tgt-123");
    expect(row.metadata).toMatchObject({ foo: "bar", actor: ACTOR });
  });

  it("legacy 2-field withServiceRole still works (null columns, actor in metadata)", async () => {
    await withServiceRole(
      { action: "test.legacy", actor: "seed" },
      async () => {},
    );
    const row = await lastAudit("test.legacy");
    expect(row.tenantId).toBeNull();
    expect(row.userId).toBeNull();
    expect(row.targetId).toBeNull();
    expect(row.metadata).toMatchObject({ actor: "seed" });
  });

  it("withTwistagContext records tenant_id/target_id on the twistag.read row", async () => {
    await withTwistagContext(
      {
        twistagRole: "twistag_admin",
        actor: ACTOR,
        tenantId: TENANT_A,
        targetId: "sprint-9",
      },
      async () => {},
    );
    const row = await lastAudit("twistag.read");
    expect(row.tenantId).toBe(TENANT_A);
    expect(row.targetId).toBe("sprint-9");
    expect(row.metadata).toMatchObject({
      actor: ACTOR,
      twistag_role: "twistag_admin",
    });
  });
});
