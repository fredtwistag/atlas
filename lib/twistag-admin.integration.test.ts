import { describe, it, expect, beforeEach } from "vitest";
import { eq, and, desc } from "drizzle-orm";
import {
  updateTenant,
  inviteMemberToTenant,
  updateMemberRoleInTenant,
  removeMemberFromTenant,
  cancelInvitationInTenant,
  getPendingInvitationInTenant,
  type TwistagActor,
} from "./twistag-admin";
import { tenants, users, invitations, auditLog } from "@/db/schema";
import {
  seedRow,
  resetDb,
  seedTenants,
  TENANT_A,
  TENANT_B,
} from "@/db/test/helpers";

const TW = "00000000-0000-4000-8000-0000000000ff";
const actor: TwistagActor = { userId: TW, twistagRole: "twistag_admin" };

const MGR_A = "eeeeeeee-eeee-4eee-8eee-eeeeeeee0001";
const MGR_A2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeee0002";
const IC_A = "eeeeeeee-eeee-4eee-8eee-eeeeeeee0003";
const MGR_B = "eeeeeeee-eeee-4eee-8eee-eeeeeeee00b1";

beforeEach(async () => {
  await resetDb();
  await seedTenants();
  await seedRow((tx) =>
    tx.insert(users).values([
      {
        id: MGR_A,
        tenantId: TENANT_A,
        email: "mgr@a.example",
        name: "Mgr A",
        role: "manager",
      },
      {
        id: MGR_A2,
        tenantId: TENANT_A,
        email: "mgr2@a.example",
        name: "Mgr A2",
        role: "manager",
      },
      {
        id: IC_A,
        tenantId: TENANT_A,
        email: "ic@a.example",
        name: "IC A",
        role: "ic",
      },
      {
        id: MGR_B,
        tenantId: TENANT_B,
        email: "mgr@b.example",
        name: "Mgr B",
        role: "manager",
      },
    ]),
  );
});

const one = <T>(rows: T[]): T | undefined => rows[0];

function readTenant(id: string) {
  return seedRow((tx) =>
    tx.select().from(tenants).where(eq(tenants.id, id)),
  ).then(one);
}
function roleOf(userId: string) {
  return seedRow((tx) =>
    tx.select({ role: users.role }).from(users).where(eq(users.id, userId)),
  ).then((r) => one(r)?.role);
}
function lastAudit(action: string) {
  return seedRow((tx) =>
    tx
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, action))
      .orderBy(desc(auditLog.id))
      .limit(1),
  ).then(one);
}

describe("updateTenant", () => {
  it("edits tenant A and leaves tenant B untouched; audits tenantId/targetId/role", async () => {
    await updateTenant(actor, TENANT_A, {
      name: "Tenant A Renamed",
      status: "paused",
    });
    const a = await readTenant(TENANT_A);
    expect(a?.name).toBe("Tenant A Renamed");
    expect(a?.status).toBe("paused");
    const b = await readTenant(TENANT_B);
    expect(b?.name).toBe("Tenant B");
    expect(b?.status).toBe("active");

    const audit = await lastAudit("twistag.tenant.update");
    expect(audit?.tenantId).toBe(TENANT_A);
    expect(audit?.targetId).toBe(TENANT_A);
    expect(audit?.metadata).toMatchObject({ twistag_role: "twistag_admin" });
  });

  it("rejects an invalid status", async () => {
    await expect(
      updateTenant(actor, TENANT_A, { status: "bogus" }),
    ).rejects.toThrow();
  });

  it("throws not found for an unknown tenant", async () => {
    await expect(
      updateTenant(actor, "00000000-0000-0000-0000-0000000000cc", {
        name: "X",
      }),
    ).rejects.toThrow();
  });
});

describe("member management", () => {
  it("invites a member (user + invitation rows, invitedByKind=twistag)", async () => {
    await inviteMemberToTenant(actor, TENANT_A, {
      name: "New IC",
      email: "new@a.example",
      role: "ic",
    });
    const u = await seedRow((tx) =>
      tx
        .select()
        .from(users)
        .where(
          and(eq(users.tenantId, TENANT_A), eq(users.email, "new@a.example")),
        ),
    ).then(one);
    expect(u?.role).toBe("ic");
    const inv = await seedRow((tx) =>
      tx
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.tenantId, TENANT_A),
            eq(invitations.email, "new@a.example"),
          ),
        ),
    ).then(one);
    expect(inv?.invitedByKind).toBe("twistag");
  });

  it("changes a member role and keeps the last-manager guard", async () => {
    await updateMemberRoleInTenant(actor, TENANT_A, IC_A, "sponsor");
    expect(await roleOf(IC_A)).toBe("sponsor");
    // Two managers → demoting one is fine.
    await updateMemberRoleInTenant(actor, TENANT_A, MGR_A2, "ic");
    // MGR_A is now the only manager → demotion blocked.
    await expect(
      updateMemberRoleInTenant(actor, TENANT_A, MGR_A, "ic"),
    ).rejects.toThrow();
    expect(await roleOf(MGR_A)).toBe("manager");
  });

  it("removes a member; audits targetId = userId", async () => {
    await removeMemberFromTenant(actor, TENANT_A, IC_A);
    expect(await roleOf(IC_A)).toBeUndefined();
    const audit = await lastAudit("twistag.member.remove");
    expect(audit?.tenantId).toBe(TENANT_A);
    expect(audit?.targetId).toBe(IC_A);
    expect(audit?.metadata).toMatchObject({ twistag_role: "twistag_admin" });
  });

  it("cannot remove the last manager", async () => {
    await removeMemberFromTenant(actor, TENANT_A, MGR_A2); // two → one
    await expect(
      removeMemberFromTenant(actor, TENANT_A, MGR_A),
    ).rejects.toThrow();
    expect(await roleOf(MGR_A)).toBe("manager");
  });

  it("explicit scoping: removing a B user via tenant A is rejected, B untouched", async () => {
    await expect(
      removeMemberFromTenant(actor, TENANT_A, MGR_B),
    ).rejects.toThrow();
    expect(await roleOf(MGR_B)).toBe("manager");
  });

  it("explicit scoping: role change of a B user via tenant A is rejected, B untouched", async () => {
    await expect(
      updateMemberRoleInTenant(actor, TENANT_A, MGR_B, "ic"),
    ).rejects.toThrow();
    expect(await roleOf(MGR_B)).toBe("manager");
  });
});

describe("invitations", () => {
  const INV = "eeeeeeee-eeee-4eee-8eee-eeeeeeee0e01";

  beforeEach(async () => {
    await seedRow((tx) =>
      tx.insert(invitations).values({
        id: INV,
        tenantId: TENANT_A,
        email: "pending@a.example",
        role: "ic",
        status: "pending",
        invitedByKind: "twistag",
        invitedById: TW,
      }),
    );
  });

  it("getPendingInvitationInTenant returns the invite within tenant A", async () => {
    const inv = await getPendingInvitationInTenant(actor, TENANT_A, INV);
    expect(inv?.email).toBe("pending@a.example");
  });

  it("getPendingInvitationInTenant is null for the wrong tenant scope", async () => {
    const inv = await getPendingInvitationInTenant(actor, TENANT_B, INV);
    expect(inv).toBeNull();
  });

  it("cancelInvitationInTenant cancels within tenant A; wrong-tenant is a no-op", async () => {
    await cancelInvitationInTenant(actor, TENANT_B, INV); // wrong tenant → no-op
    let row = await seedRow((tx) =>
      tx.select().from(invitations).where(eq(invitations.id, INV)),
    ).then(one);
    expect(row?.status).toBe("pending");

    await cancelInvitationInTenant(actor, TENANT_A, INV);
    row = await seedRow((tx) =>
      tx.select().from(invitations).where(eq(invitations.id, INV)),
    ).then(one);
    expect(row?.status).toBe("cancelled");
  });
});
