import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { invitations } from "./schema";
import { markInvitationAccepted } from "@/lib/invitation-accept";
import { refreshInvitation } from "@/lib/members";
import { inviteExpiresAt } from "@/lib/invitation-expiry";
import {
  asUser,
  seedRow,
  withServiceRoleRaw,
  resetDb,
  seedTenants,
  TENANT_A,
  TENANT_B,
  USER_A,
  USER_B,
} from "./test/helpers";

const INVITEE = "invitee@a.example";

beforeEach(async () => {
  await resetDb();
  await seedTenants();
  // A fresh, unexpired pending invite (plan 025 adds the 14-day window).
  await seedRow((tx) =>
    tx.insert(invitations).values({
      tenantId: TENANT_A,
      email: INVITEE,
      role: "ic",
      invitedByKind: "user",
      expiresAt: inviteExpiresAt(),
    }),
  );
});

/** Read the single tenant-A invite back (manager can see it under RLS). */
async function readInvite() {
  const [row] = await asUser({ tenantId: TENANT_A, role: "manager" }, (tx) =>
    tx.select().from(invitations),
  );
  return row;
}

/** Force the seeded invite's expiry into the past (service role, bypass RLS). */
async function expireSeededInvite() {
  await withServiceRoleRaw((tx) =>
    tx
      .update(invitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invitations.email, INVITEE)),
  );
}

describe("invitations — tenant isolation", () => {
  it("tenant A manager reads its invitation (positive control)", async () => {
    const rows = await asUser({ tenantId: TENANT_A, role: "manager" }, (tx) =>
      tx.select().from(invitations),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe(INVITEE);
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
  it("flips the caller's own valid pending invitation to accepted", async () => {
    const result = await markInvitationAccepted(
      { tenantId: TENANT_A, userId: USER_A, role: "ic" },
      INVITEE,
    );
    expect(result).toBe("accepted");
    const row = await readInvite();
    expect(row.status).toBe("accepted");
    expect(row.acceptedAt).not.toBeNull();
  });

  it("cannot accept another tenant's invitation (RLS → 0 rows, 'none')", async () => {
    // Tenant B user, same email as tenant A's invitee — RLS scopes the UPDATE to
    // tenant B, so tenant A's row is untouched and the caller sees no pending row.
    const result = await markInvitationAccepted(
      { tenantId: TENANT_B, userId: USER_B, role: "ic" },
      INVITEE,
    );
    expect(result).toBe("none");
    const row = await readInvite();
    expect(row.status).toBe("pending");
    expect(row.acceptedAt).toBeNull();
  });

  it("is idempotent and case-insensitive on email (second sign-in is 'none')", async () => {
    const first = await markInvitationAccepted(
      { tenantId: TENANT_A, userId: USER_A, role: "ic" },
      INVITEE,
    );
    expect(first).toBe("accepted");
    const firstRow = await readInvite();

    // Second call (uppercased email): the row is already 'accepted', so nothing
    // pending matches → "none". Critically NOT "expired": an already-accepted
    // user must sign in cleanly (plan 025 STOP condition).
    const second = await markInvitationAccepted(
      { tenantId: TENANT_A, userId: USER_A, role: "ic" },
      INVITEE.toUpperCase(),
    );
    expect(second).toBe("none");
    const secondRow = await readInvite();
    expect(secondRow.status).toBe("accepted");
    expect(secondRow.acceptedAt?.toISOString()).toBe(
      firstRow.acceptedAt?.toISOString(),
    );
  });
});

describe("markInvitationAccepted — expiry (plan 025)", () => {
  it("an EXPIRED pending invite is not accepted and reports 'expired'", async () => {
    await expireSeededInvite();
    const result = await markInvitationAccepted(
      { tenantId: TENANT_A, userId: USER_A, role: "ic" },
      INVITEE,
    );
    expect(result).toBe("expired");
    const row = await readInvite();
    expect(row.status).toBe("pending"); // untouched — never flipped
    expect(row.acceptedAt).toBeNull();
  });

  it("a NULL-expiry pending invite (legacy row) is treated as expired", async () => {
    await withServiceRoleRaw((tx) =>
      tx
        .update(invitations)
        .set({ expiresAt: null })
        .where(eq(invitations.email, INVITEE)),
    );
    const result = await markInvitationAccepted(
      { tenantId: TENANT_A, userId: USER_A, role: "ic" },
      INVITEE,
    );
    expect(result).toBe("expired");
  });

  it("RESEND revives an expired invite: refresh → then acceptance succeeds", async () => {
    await expireSeededInvite();
    // Sanity: expired before resend.
    expect(
      await markInvitationAccepted(
        { tenantId: TENANT_A, userId: USER_A, role: "ic" },
        INVITEE,
      ),
    ).toBe("expired");

    // Manager resends → status back to pending + fresh window.
    const invite = await readInvite();
    await refreshInvitation(
      { tenantId: TENANT_A, userId: USER_A, role: "manager" },
      invite.id,
    );
    const refreshed = await readInvite();
    expect(refreshed.status).toBe("pending");
    expect(refreshed.expiresAt).not.toBeNull();
    expect(refreshed.expiresAt!.getTime()).toBeGreaterThan(Date.now());

    // Now acceptance goes through.
    const result = await markInvitationAccepted(
      { tenantId: TENANT_A, userId: USER_A, role: "ic" },
      INVITEE,
    );
    expect(result).toBe("accepted");
  });

  it("RESEND also revives a cancelled invite (status → pending)", async () => {
    await withServiceRoleRaw((tx) =>
      tx
        .update(invitations)
        .set({ status: "cancelled" })
        .where(eq(invitations.email, INVITEE)),
    );
    const invite = await readInvite();
    await refreshInvitation(
      { tenantId: TENANT_A, userId: USER_A, role: "manager" },
      invite.id,
    );
    const row = await readInvite();
    expect(row.status).toBe("pending");
    expect(
      await markInvitationAccepted(
        { tenantId: TENANT_A, userId: USER_A, role: "ic" },
        INVITEE,
      ),
    ).toBe("accepted");
  });
});
