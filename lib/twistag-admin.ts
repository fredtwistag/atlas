/**
 * Twistag admin mutations (server-only, no Next/Supabase imports so they are
 * integration-testable). The "use server" wrappers in
 * app/(app)/admin/clients/[tenantId]/actions.ts add session resolution,
 * revalidation, and Supabase auth side-effects on top of these.
 *
 * Authorization is NOT done here — the only gate is `kind === "twistag"`,
 * enforced by `twistagProcedure`/`requireTwistagSession` upstream. Every Twistag
 * staff member has identical, full permissions. `TwistagActor.twistagRole` is
 * carried for AUDIT ATTRIBUTION ONLY (recorded in metadata), never checked.
 *
 * Writes run as service_role (audited, tenant_id/target_id filled). Every
 * statement is explicitly tenant-scoped since RLS is bypassed.
 */
import { eq, and } from "drizzle-orm";
import { withServiceRole, withTwistagContext } from "@/db/client";
import { tenants, users, invitations, opportunities } from "@/db/schema";
import { MEMBER_ROLES, removeMemberTx } from "./members";
import { inviteExpiresAt } from "./invitation-expiry";

/** Carried for audit attribution only — NEVER used for authorization. */
export type TwistagActor = { userId: string; twistagRole: string };

const TENANT_STATUSES = ["active", "onboarding", "paused", "churned"] as const;

/** Edit ops-level company fields (name/segment/status). No client decisions. */
export async function updateTenant(
  actor: TwistagActor,
  tenantId: string,
  patch: { name?: string; segment?: string; status?: string },
): Promise<void> {
  const set: Partial<{ name: string; segment: string; status: string }> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.segment !== undefined) set.segment = patch.segment;
  if (patch.status !== undefined) {
    if (!(TENANT_STATUSES as readonly string[]).includes(patch.status)) {
      throw new Error("invalid status");
    }
    set.status = patch.status;
  }
  if (Object.keys(set).length === 0) throw new Error("nothing to update");

  await withServiceRole(
    {
      action: "twistag.tenant.update",
      actor: actor.userId,
      tenantId,
      targetId: tenantId,
      metadata: { twistag_role: actor.twistagRole, ...set },
    },
    async (tx) => {
      const [existing] = await tx
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.id, tenantId));
      if (!existing) throw new Error("not found");
      await tx.update(tenants).set(set).where(eq(tenants.id, tenantId));
    },
  );
}

/** Invite a member into a tenant (DB rows only — wrapper does Supabase + email). */
export async function inviteMemberToTenant(
  actor: TwistagActor,
  tenantId: string,
  input: { name: string; email: string; role: string },
): Promise<void> {
  if (!(MEMBER_ROLES as readonly string[]).includes(input.role)) {
    throw new Error("invalid role");
  }
  await withServiceRole(
    {
      action: "twistag.member.invite",
      actor: actor.userId,
      tenantId,
      targetId: input.email,
      metadata: {
        twistag_role: actor.twistagRole,
        role: input.role,
        email: input.email,
      },
    },
    async (tx) => {
      const [tenant] = await tx
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.id, tenantId));
      if (!tenant) throw new Error("not found");
      await tx
        .insert(users)
        .values({
          tenantId,
          email: input.email,
          name: input.name,
          role: input.role,
        })
        .onConflictDoNothing();
      // Plan 025: 14-day expiry. A re-invite of the same email refreshes status
      // to pending and resets the window.
      await tx
        .insert(invitations)
        .values({
          tenantId,
          email: input.email,
          role: input.role,
          invitedByKind: "twistag",
          invitedById: actor.userId,
          expiresAt: inviteExpiresAt(),
        })
        .onConflictDoUpdate({
          target: [invitations.tenantId, invitations.email],
          set: {
            role: input.role,
            status: "pending",
            invitedByKind: "twistag",
            invitedById: actor.userId,
            expiresAt: inviteExpiresAt(),
          },
        });
    },
  );
}

/** Change a member's role. Keeps the last-manager guard; no self-edit concept. */
export async function updateMemberRoleInTenant(
  actor: TwistagActor,
  tenantId: string,
  userId: string,
  role: string,
): Promise<void> {
  if (!(MEMBER_ROLES as readonly string[]).includes(role)) {
    throw new Error("invalid role");
  }
  await withServiceRole(
    {
      action: "twistag.member.role",
      actor: actor.userId,
      tenantId,
      targetId: userId,
      metadata: { twistag_role: actor.twistagRole, role },
    },
    async (tx) => {
      const [target] = await tx
        .select({ role: users.role })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
      if (!target) throw new Error("not found");

      if (target.role === "manager" && role !== "manager") {
        const managers = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.tenantId, tenantId), eq(users.role, "manager")));
        if (managers.length <= 1) {
          throw new Error("cannot demote the last manager");
        }
      }

      await tx
        .update(users)
        .set({ role })
        .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
    },
  );
}

/** Remove a member and their sprint footprint. Returns the removed email. */
export async function removeMemberFromTenant(
  actor: TwistagActor,
  tenantId: string,
  userId: string,
): Promise<{ email: string }> {
  return withServiceRole(
    {
      action: "twistag.member.remove",
      actor: actor.userId,
      tenantId,
      targetId: userId,
      metadata: { twistag_role: actor.twistagRole },
    },
    (tx) => removeMemberTx(tx, tenantId, userId),
  );
}

/** Cancel a pending invitation. Tenant-scoped explicitly. */
export async function cancelInvitationInTenant(
  actor: TwistagActor,
  tenantId: string,
  invitationId: string,
): Promise<void> {
  await withServiceRole(
    {
      action: "twistag.invite.cancel",
      actor: actor.userId,
      tenantId,
      targetId: invitationId,
      metadata: { twistag_role: actor.twistagRole },
    },
    async (tx) => {
      await tx
        .update(invitations)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(invitations.id, invitationId),
            eq(invitations.tenantId, tenantId),
          ),
        );
    },
  );
}

/**
 * Resend refresh (plan 025): revive a pending invitation — status back to
 * 'pending' and a fresh 14-day `expires_at`. Tenant-scoped explicitly (service
 * role bypasses RLS). Mirrors `members.refreshInvitation` for the Twistag path.
 */
export async function refreshInvitationInTenant(
  actor: TwistagActor,
  tenantId: string,
  invitationId: string,
): Promise<void> {
  await withServiceRole(
    {
      action: "twistag.invite.refresh",
      actor: actor.userId,
      tenantId,
      targetId: invitationId,
      metadata: { twistag_role: actor.twistagRole },
    },
    async (tx) => {
      await tx
        .update(invitations)
        .set({ status: "pending", expiresAt: inviteExpiresAt() })
        .where(
          and(
            eq(invitations.id, invitationId),
            eq(invitations.tenantId, tenantId),
          ),
        );
    },
  );
}

/* ------------------------------------------------------------------------- *
 * Plan 016 Step 6 — opportunity curation (the launch-week safety valve).
 *
 * Twistag reviews every surfaced opportunity before the sponsor sees it. These
 * let staff polish engine output (title/description/rationale/impact) and move
 * an opportunity between provisional/surfaced/hidden. Both refuse to touch
 * `approved` rows — once a sponsor has acted, the opportunity is frozen (same
 * rule recompute honors). Tenant-scoped explicitly; audited.
 * ------------------------------------------------------------------------- */

/** Curation statuses Twistag can set. NEVER includes `approved` (sponsor-only). */
const CURATION_STATUSES = ["provisional", "surfaced", "hidden"] as const;
export type CurationStatus = (typeof CURATION_STATUSES)[number];

export type OpportunityEditPatch = {
  title?: string;
  description?: string;
  rationale?: string;
  impactLow?: number;
  impactHigh?: number;
};

/**
 * Edit an opportunity's curatable fields. Refuses if the row is `approved`.
 * `impactLow`/`impactHigh` are validated as a pair when either is present
 * (resolved against the row's current values) so a partial edit can't invert
 * the range.
 */
export async function updateOpportunity(
  actor: TwistagActor,
  tenantId: string,
  opportunityId: string,
  patch: OpportunityEditPatch,
): Promise<void> {
  const set: Partial<{
    title: string;
    description: string;
    rationale: string;
    impactLow: number;
    impactHigh: number;
  }> = {};
  if (patch.title !== undefined) {
    if (patch.title.trim().length < 5) throw new Error("title too short");
    set.title = patch.title.trim();
  }
  if (patch.description !== undefined) {
    if (patch.description.trim().length < 10)
      throw new Error("description too short");
    set.description = patch.description.trim();
  }
  if (patch.rationale !== undefined) {
    if (patch.rationale.trim().length < 10)
      throw new Error("rationale too short");
    set.rationale = patch.rationale.trim();
  }
  if (patch.impactLow !== undefined) set.impactLow = patch.impactLow;
  if (patch.impactHigh !== undefined) set.impactHigh = patch.impactHigh;
  if (Object.keys(set).length === 0) throw new Error("nothing to update");

  await withServiceRole(
    {
      action: "twistag.opportunity.update",
      actor: actor.userId,
      tenantId,
      targetId: opportunityId,
      metadata: { twistag_role: actor.twistagRole, fields: Object.keys(set) },
    },
    async (tx) => {
      const [row] = await tx
        .select({
          status: opportunities.status,
          impactLow: opportunities.impactLow,
          impactHigh: opportunities.impactHigh,
        })
        .from(opportunities)
        .where(
          and(
            eq(opportunities.id, opportunityId),
            eq(opportunities.tenantId, tenantId),
          ),
        );
      if (!row) throw new Error("not found");
      if (row.status === "approved")
        throw new Error("cannot edit an approved opportunity");

      const low = set.impactLow ?? row.impactLow;
      const high = set.impactHigh ?? row.impactHigh;
      if (low > high) throw new Error("impactLow must be <= impactHigh");

      await tx
        .update(opportunities)
        .set(set)
        .where(
          and(
            eq(opportunities.id, opportunityId),
            eq(opportunities.tenantId, tenantId),
          ),
        );
    },
  );
}

/**
 * Move an opportunity between provisional/surfaced/hidden. Refuses if the row
 * is `approved`. The `approved` transition is sponsor-only (opportunity.approve)
 * and is never reachable here.
 */
export async function setOpportunityStatus(
  actor: TwistagActor,
  tenantId: string,
  opportunityId: string,
  status: string,
): Promise<void> {
  if (!(CURATION_STATUSES as readonly string[]).includes(status)) {
    throw new Error("invalid status");
  }
  await withServiceRole(
    {
      action: "twistag.opportunity.status",
      actor: actor.userId,
      tenantId,
      targetId: opportunityId,
      metadata: { twistag_role: actor.twistagRole, status },
    },
    async (tx) => {
      const [row] = await tx
        .select({ status: opportunities.status })
        .from(opportunities)
        .where(
          and(
            eq(opportunities.id, opportunityId),
            eq(opportunities.tenantId, tenantId),
          ),
        );
      if (!row) throw new Error("not found");
      if (row.status === "approved")
        throw new Error("cannot change an approved opportunity");

      await tx
        .update(opportunities)
        .set({ status })
        .where(
          and(
            eq(opportunities.id, opportunityId),
            eq(opportunities.tenantId, tenantId),
          ),
        );
    },
  );
}

/**
 * Look up a pending invitation so the wrapper can re-issue the Supabase auth
 * invite. Cross-tenant read (audited as twistag.read). Null if not in `tenantId`.
 */
export async function getPendingInvitationInTenant(
  actor: TwistagActor,
  tenantId: string,
  invitationId: string,
): Promise<{ email: string; role: string } | null> {
  return withTwistagContext(
    {
      twistagRole: actor.twistagRole,
      actor: actor.userId,
      tenantId,
      targetId: invitationId,
    },
    async (tx) => {
      const [row] = await tx
        .select({ email: invitations.email, role: invitations.role })
        .from(invitations)
        .where(
          and(
            eq(invitations.id, invitationId),
            eq(invitations.tenantId, tenantId),
          ),
        );
      return row ?? null;
    },
  );
}
