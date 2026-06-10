import { describe, it, expect, beforeEach } from "vitest";
import { invitations } from "./schema";
import { markInvitationAccepted } from "@/lib/invitation-accept";
import {
  asUser,
  seedRow,
  resetDb,
  seedTenants,
  TENANT_A,
  TENANT_B,
  USER_A,
  USER_B,
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

describe("markInvitationAccepted — own-claims accept, no service role", () => {
  async function readInvite() {
    const [row] = await asUser({ tenantId: TENANT_A, role: "manager" }, (tx) =>
      tx.select().from(invitations),
    );
    return row;
  }

  it("flips the caller's own pending invitation to accepted", async () => {
    await markInvitationAccepted(
      { tenantId: TENANT_A, userId: USER_A, role: "ic" },
      "invitee@a.example",
    );
    const row = await readInvite();
    expect(row.status).toBe("accepted");
    expect(row.acceptedAt).not.toBeNull();
  });

  it("cannot accept another tenant's invitation (RLS → 0 rows)", async () => {
    // Tenant B user, same email as tenant A's invitee — RLS scopes the UPDATE to
    // tenant B, so tenant A's row is untouched.
    await markInvitationAccepted(
      { tenantId: TENANT_B, userId: USER_B, role: "ic" },
      "invitee@a.example",
    );
    const row = await readInvite();
    expect(row.status).toBe("pending");
    expect(row.acceptedAt).toBeNull();
  });

  it("is idempotent and case-insensitive on email", async () => {
    await markInvitationAccepted(
      { tenantId: TENANT_A, userId: USER_A, role: "ic" },
      "invitee@a.example",
    );
    const first = await readInvite();
    // Second call (uppercased email) matches nothing pending → no-op.
    await markInvitationAccepted(
      { tenantId: TENANT_A, userId: USER_A, role: "ic" },
      "INVITEE@A.EXAMPLE",
    );
    const second = await readInvite();
    expect(second.status).toBe("accepted");
    expect(second.acceptedAt?.toISOString()).toBe(
      first.acceptedAt?.toISOString(),
    );
  });
});
