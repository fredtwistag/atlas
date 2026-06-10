/**
 * Member-management core logic (server-only, no Next/Supabase imports so it is
 * unit/integration testable). The "use server" wrappers in
 * app/(app)/team/actions.ts add session resolution, revalidation, and the
 * Supabase auth side-effects on top of these.
 *
 * Guards live here so they are exercised by the integration tests:
 *   - only managers/sponsors may mutate members,
 *   - you cannot change or remove yourself,
 *   - you cannot demote or remove the last manager,
 *   - cross-tenant targets are invisible (RLS) or explicitly tenant-scoped.
 */
import { eq, and, sql } from "drizzle-orm";
import { withTenantContext, withServiceRole } from "@/db/client";
import {
  users,
  invitations,
  sprints,
  sprintParticipants,
  sessions,
  captures,
  opportunities,
} from "@/db/schema";

export type Actor = { tenantId: string; userId: string; role: string };

export const MEMBER_ROLES = ["ic", "sponsor", "manager"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

function assertManager(actor: Actor): void {
  if (!(actor.role === "manager" || actor.role === "sponsor")) {
    throw new Error("forbidden");
  }
}

/**
 * Change a member's role. Tenant-scoped via RLS (a target in another tenant is
 * simply invisible → "not found"). Blocks self-edits and demoting the last
 * manager so a tenant can never lock itself out of manager actions.
 */
export async function updateMemberRole(
  actor: Actor,
  userId: string,
  role: string,
): Promise<void> {
  assertManager(actor);
  if (!(MEMBER_ROLES as readonly string[]).includes(role)) {
    throw new Error("invalid role");
  }
  if (userId === actor.userId) {
    throw new Error("cannot change your own role");
  }
  await withTenantContext(actor, async (tx) => {
    const [target] = await tx
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId));
    if (!target) throw new Error("not found");

    if (target.role === "manager" && role !== "manager") {
      const managers = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "manager"));
      if (managers.length <= 1) {
        throw new Error("cannot demote the last manager");
      }
    }

    await tx.update(users).set({ role }).where(eq(users.id, userId));
  });
}

/**
 * Hard-remove a member and their sprint footprint. Runs as service_role
 * (audited) because it must clear FK-referencing rows the user owns; every
 * write is explicitly tenant-scoped since RLS is bypassed. Blocks removing
 * yourself or the last manager. Returns the removed email so the wrapper can
 * delete the matching Supabase auth user.
 */
export async function removeMemberRecord(
  actor: Actor,
  userId: string,
): Promise<{ email: string }> {
  assertManager(actor);
  if (userId === actor.userId) {
    throw new Error("cannot remove yourself");
  }
  return withServiceRole(
    { action: "member.remove", actor: actor.userId },
    async (tx) => {
      const [target] = await tx
        .select()
        .from(users)
        .where(and(eq(users.id, userId), eq(users.tenantId, actor.tenantId)));
      if (!target) throw new Error("not found");

      if (target.role === "manager") {
        const managers = await tx
          .select({ id: users.id })
          .from(users)
          .where(
            and(eq(users.tenantId, actor.tenantId), eq(users.role, "manager")),
          );
        if (managers.length <= 1) {
          throw new Error("cannot remove the last manager");
        }
      }

      // Null out references that should survive the person leaving.
      await tx
        .update(sprints)
        .set({ sponsorId: null })
        .where(eq(sprints.sponsorId, userId));
      await tx
        .update(sprints)
        .set({ managerId: null })
        .where(eq(sprints.managerId, userId));
      await tx
        .update(opportunities)
        .set({ approvedBy: null })
        .where(eq(opportunities.approvedBy, userId));

      // Delete the rows the user owns, inner-most FK first.
      await tx.execute(
        sql`DELETE FROM public.opportunity_evidence
            WHERE capture_id IN (SELECT id FROM public.captures WHERE user_id = ${userId}::uuid)`,
      );
      await tx.delete(captures).where(eq(captures.userId, userId));
      await tx.delete(sessions).where(eq(sessions.userId, userId));
      await tx
        .delete(sprintParticipants)
        .where(eq(sprintParticipants.userId, userId));
      await tx
        .delete(users)
        .where(and(eq(users.id, userId), eq(users.tenantId, actor.tenantId)));

      return { email: target.email };
    },
  );
}

/** Mark a pending invitation cancelled. Tenant-scoped via RLS (no-op cross-tenant). */
export async function cancelInvitation(
  actor: Actor,
  invitationId: string,
): Promise<void> {
  assertManager(actor);
  await withTenantContext(actor, async (tx) => {
    await tx
      .update(invitations)
      .set({ status: "cancelled" })
      .where(eq(invitations.id, invitationId));
  });
}

/**
 * Look up a pending invitation so the wrapper can re-issue the Supabase auth
 * invite. Returns null if it isn't visible to the caller's tenant.
 */
export async function getPendingInvitation(
  actor: Actor,
  invitationId: string,
): Promise<{ email: string; role: string } | null> {
  assertManager(actor);
  return withTenantContext(actor, async (tx) => {
    const [row] = await tx
      .select({ email: invitations.email, role: invitations.role })
      .from(invitations)
      .where(eq(invitations.id, invitationId));
    return row ?? null;
  });
}
