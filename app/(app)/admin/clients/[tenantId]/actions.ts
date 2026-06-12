"use server";

import { createElement } from "react";
import { revalidatePath } from "next/cache";
import { eq, and, ne, desc } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getApi } from "@/server/trpc/caller";
import { withTwistagContext } from "@/db/client";
import { tenants, sprints, topics } from "@/db/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateInviteLink } from "@/services/email/invite-link";
import { sendEmail } from "@/services/email/send";
import {
  InviteEmail,
  inviteSubject,
  type InviteRole,
} from "@/emails/InviteEmail";
import {
  updateTenant,
  inviteMemberToTenant,
  updateMemberRoleInTenant,
  removeMemberFromTenant,
  cancelInvitationInTenant,
  getPendingInvitationInTenant,
  refreshInvitationInTenant,
  type TwistagActor,
} from "@/lib/twistag-admin";

/** Resolve the current Twistag staff member as an admin actor, or throw. */
async function requireTwistagActor(): Promise<TwistagActor> {
  const session = await getSession();
  if (!session || session.kind !== "twistag") throw new Error("forbidden");
  return { userId: session.userId, twistagRole: session.twistagRole };
}

/**
 * Best-effort invite email for a Twistag-issued invite. Reads org name + (for
 * ICs) the current sprint's topics via a Twistag read. Never throws — the
 * invite rows are already saved; a failed send is recoverable via Resend.
 */
async function deliverTwistagInvite(
  actor: TwistagActor,
  tenantId: string,
  email: string,
  role: InviteRole,
): Promise<void> {
  try {
    const confirmUrl = await generateInviteLink(email);
    const ctx = await withTwistagContext(
      { twistagRole: actor.twistagRole, actor: actor.userId, tenantId },
      async (tx) => {
        const [tenant] = await tx
          .select({ name: tenants.name })
          .from(tenants)
          .where(eq(tenants.id, tenantId));
        let topicPreview: { title: string; estMinutes: number }[] = [];
        if (role === "ic") {
          const [spr] = await tx
            .select({ id: sprints.id })
            .from(sprints)
            .where(
              and(
                eq(sprints.tenantId, tenantId),
                ne(sprints.status, "completed"),
              ),
            )
            .orderBy(desc(sprints.createdAt))
            .limit(1);
          if (spr) {
            topicPreview = await tx
              .select({ title: topics.title, estMinutes: topics.estMinutes })
              .from(topics)
              .where(eq(topics.sprintId, spr.id))
              .orderBy(topics.orderIdx);
          }
        }
        return {
          orgName: tenant?.name ?? "your organization",
          topics: topicPreview,
        };
      },
    );

    await sendEmail({
      to: email,
      subject: inviteSubject(role, "The Atlas team", ctx.orgName),
      react: createElement(InviteEmail, {
        role,
        orgName: ctx.orgName,
        inviterName: "The Atlas team",
        confirmUrl,
        topics: role === "ic" ? ctx.topics : undefined,
      }),
    });
  } catch {
    // Saved-but-not-sent: the Resend action retries delivery.
  }
}

/** Edit a company's name/segment/status. */
export async function updateTenantAction(
  tenantId: string,
  input: { name: string; segment: string; status: string },
): Promise<void> {
  const actor = await requireTwistagActor();
  await updateTenant(actor, tenantId, input);
  revalidatePath(`/admin/clients/${tenantId}`);
}

/** Invite a member into a company (DB rows + auth user + email). */
export async function inviteMemberAction(
  tenantId: string,
  input: { name: string; email: string; role: string },
): Promise<void> {
  const actor = await requireTwistagActor();
  await inviteMemberToTenant(actor, tenantId, input);

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email: input.email,
    email_confirm: true,
  });
  if (error && !/already/i.test(error.message)) {
    throw new Error(error.message);
  }

  await deliverTwistagInvite(
    actor,
    tenantId,
    input.email,
    input.role as InviteRole,
  );
  revalidatePath(`/admin/clients/${tenantId}`);
}

/** Change a member's role. */
export async function updateMemberRoleAction(
  tenantId: string,
  userId: string,
  role: string,
): Promise<void> {
  const actor = await requireTwistagActor();
  await updateMemberRoleInTenant(actor, tenantId, userId, role);
  revalidatePath(`/admin/clients/${tenantId}`);
}

/** Remove a member and their sprint footprint, then delete their auth user. */
export async function removeMemberAction(
  tenantId: string,
  userId: string,
): Promise<void> {
  const actor = await requireTwistagActor();
  const { email } = await removeMemberFromTenant(actor, tenantId, userId);

  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.listUsers();
    const authUser = data?.users.find((u) => u.email === email);
    if (authUser) await admin.auth.admin.deleteUser(authUser.id);
  } catch {
    // The DB removal is the source of truth; auth cleanup failing is non-fatal.
  }

  revalidatePath(`/admin/clients/${tenantId}`);
}

/** Re-send a pending invitation's email (and ensure its auth user exists). */
export async function resendInviteAction(
  tenantId: string,
  invitationId: string,
): Promise<void> {
  const actor = await requireTwistagActor();
  const invite = await getPendingInvitationInTenant(
    actor,
    tenantId,
    invitationId,
  );
  if (!invite) throw new Error("not found");

  // Plan 025: revive the invite — status back to pending + fresh 14-day window.
  await refreshInvitationInTenant(actor, tenantId, invitationId);

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email: invite.email,
    email_confirm: true,
  });
  if (error && !/already/i.test(error.message)) {
    throw new Error(error.message);
  }

  await deliverTwistagInvite(
    actor,
    tenantId,
    invite.email,
    invite.role as InviteRole,
  );
  revalidatePath(`/admin/clients/${tenantId}`);
}

/** Cancel a pending invitation. */
export async function cancelInviteAction(
  tenantId: string,
  invitationId: string,
): Promise<void> {
  const actor = await requireTwistagActor();
  await cancelInvitationInTenant(actor, tenantId, invitationId);
  revalidatePath(`/admin/clients/${tenantId}`);
}

/** Close a sprint via the audited twistag procedure. */
export async function closeSprintAction(
  tenantId: string,
  sprintId: string,
): Promise<void> {
  await requireTwistagActor();
  const api = await getApi();
  await api.twistag.sprintClose({ sprintId });
  revalidatePath(`/admin/clients/${tenantId}`);
}

/** Recompute a sprint's opportunities from its captures (Plan 016 Step 5). */
export async function recomputeOpportunitiesAction(
  tenantId: string,
  sprintId: string,
): Promise<void> {
  await requireTwistagActor();
  const api = await getApi();
  await api.twistag.recompute({ sprintId });
  revalidatePath(`/admin/clients/${tenantId}`);
}

/** Edit an opportunity's curatable fields (Plan 016 Step 6). */
export async function updateOpportunityAction(
  tenantId: string,
  opportunityId: string,
  patch: {
    title?: string;
    description?: string;
    rationale?: string;
    impactLow?: number;
    impactHigh?: number;
  },
): Promise<void> {
  await requireTwistagActor();
  const api = await getApi();
  await api.twistag.opportunityUpdate({ opportunityId, ...patch });
  revalidatePath(`/admin/clients/${tenantId}`);
}

/** Move an opportunity between provisional/surfaced/hidden (Plan 016 Step 6). */
export async function setOpportunityStatusAction(
  tenantId: string,
  opportunityId: string,
  status: "provisional" | "surfaced" | "hidden",
): Promise<void> {
  await requireTwistagActor();
  const api = await getApi();
  await api.twistag.opportunitySetStatus({ opportunityId, status });
  revalidatePath(`/admin/clients/${tenantId}`);
}
