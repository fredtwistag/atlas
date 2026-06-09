import { describe, it, expect, beforeEach } from "vitest";
import { invitations } from "./schema";
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
  await seedRow((tx) =>
    tx.insert(invitations).values({
      tenantId: TENANT_A,
      email: "invitee@a.example",
      role: "ic",
      invitedByKind: "user",
    }),
  );
});

describe("invitations — tenant isolation", () => {
  it("tenant A manager reads its invitation (positive control)", async () => {
    const rows = await asUser({ tenantId: TENANT_A, role: "manager" }, (tx) =>
      tx.select().from(invitations),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("invitee@a.example");
  });

  it("tenant B cannot read tenant A invitations", async () => {
    const rows = await asUser({ tenantId: TENANT_B, role: "manager" }, (tx) =>
      tx.select().from(invitations),
    );
    expect(rows).toHaveLength(0);
  });

  it("a manager cannot create an invitation tagged another tenant", async () => {
    await expect(
      asUser({ tenantId: TENANT_B, role: "manager" }, (tx) =>
        tx.insert(invitations).values({
          tenantId: TENANT_A,
          email: "evil@b.example",
          role: "ic",
          invitedByKind: "user",
        }),
      ),
    ).rejects.toThrow();
  });
});
