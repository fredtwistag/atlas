import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { users } from "./schema";
import {
  asUser,
  seedRow,
  resetDb,
  seedTenants,
  TENANT_A,
  TENANT_B,
} from "./test/helpers";

beforeEach(async () => {
  await resetDb();
  await seedTenants();
  // A user owned by tenant A.
  await seedRow((tx) =>
    tx.insert(users).values({
      tenantId: TENANT_A,
      email: "secret@a.example",
      name: "Secret A",
      role: "ic",
    }),
  );
});

describe("users — tenant isolation", () => {
  it("tenant A can read its own user (positive control)", async () => {
    const rows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(users),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("secret@a.example");
  });

  it("tenant B cannot read tenant A users", async () => {
    const rows = await asUser({ tenantId: TENANT_B }, (tx) =>
      tx.select().from(users),
    );
    expect(rows).toHaveLength(0);
  });

  it("tenant B cannot insert a row tagged tenant A", async () => {
    await expect(
      asUser({ tenantId: TENANT_B }, (tx) =>
        tx.insert(users).values({
          tenantId: TENANT_A,
          email: "evil@b.example",
          name: "Evil",
          role: "ic",
        }),
      ),
    ).rejects.toThrow();
  });

  it("tenant B cannot update tenant A rows", async () => {
    const result = await asUser({ tenantId: TENANT_B }, (tx) =>
      tx
        .update(users)
        .set({ name: "hacked" })
        .where(eq(users.email, "secret@a.example")),
    );
    expect(result.count ?? 0).toBe(0);
    const stillOk = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(users),
    );
    expect(stillOk[0].name).toBe("Secret A");
  });

  it("tenant B cannot delete tenant A rows", async () => {
    const result = await asUser({ tenantId: TENANT_B }, (tx) =>
      tx.delete(users).where(eq(users.email, "secret@a.example")),
    );
    expect(result.count ?? 0).toBe(0);
    const stillThere = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(users),
    );
    expect(stillThere).toHaveLength(1);
  });
});

describe("users — privacy_ack_at (PRD F1.5)", () => {
  it("a tenant can set privacy_ack_at on its own user", async () => {
    const [u] = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(users),
    );
    const result = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx
        .update(users)
        .set({ privacyAckAt: new Date() })
        .where(eq(users.id, u.id)),
    );
    expect(result.count ?? 0).toBe(1);
    const [after] = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(users),
    );
    expect(after.privacyAckAt).not.toBeNull();
  });

  it("tenant B cannot set privacy_ack_at on a tenant A user (RLS → 0 rows)", async () => {
    const result = await asUser({ tenantId: TENANT_B }, (tx) =>
      tx
        .update(users)
        .set({ privacyAckAt: new Date() })
        .where(eq(users.email, "secret@a.example")),
    );
    expect(result.count ?? 0).toBe(0);
    const [after] = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(users),
    );
    expect(after.privacyAckAt).toBeNull();
  });
});
