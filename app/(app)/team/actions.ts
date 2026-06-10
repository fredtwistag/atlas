"use server";

import { createElement } from "react";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, ne, desc } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { withServiceRole, withTenantContext } from "@/db/client";
import { users, invitations, tenants, sprints, topics } from "@/db/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { InviteMemberSchema } from "@/lib/invitations";
import { generateInviteLink } from "@/services/email/invite-link";
import { sendEmail } from "@/services/email/send";
import {
  InviteEmail,
  inviteSubject,
  type InviteRole,
} from "@/emails/InviteEmail";
import {
  updateMemberRole,
  removeMemberRecord,
  cancelInvitation,
  getPendingInvitation,
  type Actor,
} from "@/lib/members";

type TenantRef = { tenantId: string; userId: string; role: string };

/**
 * Generate the invite link and send the role-appropriate InviteEmail. Returns
 * false on any failure (Supabase link, DB read, or Resend send) so the caller
 * can surface "saved but not sent" without rolling back the invite rows. With no
 * RESEND_API_KEY the send no-ops and this still returns true.
 */
async function deliverInviteEmail(
  ref: TenantRef,
  email: string,
  role: InviteRole,
): Promise<boolean> {
  try {
    const confirmUrl = await generateInviteLink(email);
    const ctx = await withTenantContext(ref, async (tx) => {
      const [inviter] = await tx
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, ref.userId));
      const [tenant] = await tx
        .select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, ref.tenantId));
      let topicPreview: { title: string; estMinutes: number }[] = [];
      if (role === "ic") {
        const [spr] = await tx
          .select({ id: sprints.id })
          .from(sprints)
          .where(ne(sprints.status, "completed"))
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
        inviterName: inviter?.name ?? "Your team",
        orgName: tenant?.name ?? "your organization",
        topics: topicPreview,
      };
    });

    await sendEmail({
      to: email,
      subject: inviteSubject(role, ctx.inviterName, ctx.orgName),
      react: createElement(InviteEmail, {
        role,
        orgName: ctx.orgName,
        inviterName: ctx.inviterName,
        confirmUrl,
        topics: role === "ic" ? ctx.topics : undefined,
      }),
    });
    return true;
  } catch {
    return false;
  }
}

/** A manager invites a member (ic/sponsor) into their own organization. */
export async function inviteMember(formData: FormData): Promise<void> {
  const session = await getSession();
  if (
    !session ||
    session.kind !== "tenant" ||
    !(session.role === "manager" || session.role === "sponsor")
  ) {
    throw new Error("forbidden");
  }

  const parsed = InviteMemberSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    redirect("/team?error=invalid");
  }
  const { name, email, role } = parsed.data;
  const tenantId = session.tenantId;

  await withServiceRole(
    { action: "member.invite", actor: session.userId },
    async (tx) => {
      await tx
        .insert(users)
        .values({ tenantId, email, name, role })
        .onConflictDoNothing();
      await tx
        .insert(invitations)
        .values({
          tenantId,
          email,
          role,
          invitedByKind: "user",
          invitedById: session.userId,
        })
        .onConflictDoNothing();
    },
  );

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (error && !/already/i.test(error.message)) {
    throw new Error(error.message);
  }

  const delivered = await deliverInviteEmail(
    { tenantId, userId: session.userId, role: session.role },
    email,
    role,
  );

  revalidatePath("/team");
  // The invite rows are saved either way; only the redirect differs so the
  // manager knows to retry delivery via "Resend invite".
  redirect(
    delivered
      ? `/team?invited=${encodeURIComponent(email)}`
      : "/team?error=email",
  );
}

/** Resolve the current manager/sponsor as a member-management actor, or throw. */
async function requireManagerActor(): Promise<Actor> {
  const session = await getSession();
  if (
    !session ||
    session.kind !== "tenant" ||
    !(session.role === "manager" || session.role === "sponsor")
  ) {
    throw new Error("forbidden");
  }
  return {
    tenantId: session.tenantId,
    userId: session.userId,
    role: session.role,
  };
}

/** Change a member's role (manager/sponsor only; not self; not the last manager). */
export async function updateMemberRoleAction(
  userId: string,
  role: string,
): Promise<void> {
  const actor = await requireManagerActor();
  await updateMemberRole(actor, userId, role);
  revalidatePath("/team");
}

/** Remove a member and their sprint footprint, then delete their auth user. */
export async function removeMemberAction(userId: string): Promise<void> {
  const actor = await requireManagerActor();
  const { email } = await removeMemberRecord(actor, userId);

  // Best-effort: clear the matching Supabase auth user so they can't sign back
  // in. The DB removal is the source of truth; auth cleanup failing is non-fatal.
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.listUsers();
    const authUser = data?.users.find((u) => u.email === email);
    if (authUser) await admin.auth.admin.deleteUser(authUser.id);
  } catch {
    // ignore — the user is already removed from the tenant.
  }

  revalidatePath("/team");
}

/** Cancel a pending invitation. */
export async function cancelInviteAction(invitationId: string): Promise<void> {
  const actor = await requireManagerActor();
  await cancelInvitation(actor, invitationId);
  revalidatePath("/team");
}

/** Re-send a pending invitation's email (and ensure its auth user exists). */
export async function resendInviteAction(invitationId: string): Promise<void> {
  const actor = await requireManagerActor();
  const invite = await getPendingInvitation(actor, invitationId);
  if (!invite) throw new Error("not found");

  // The auth user is created at first invite, but a resend after a failed first
  // attempt may still need it — createUser is idempotent.
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email: invite.email,
    email_confirm: true,
  });
  if (error && !/already/i.test(error.message)) {
    throw new Error(error.message);
  }

  await deliverInviteEmail(actor, invite.email, invite.role as InviteRole);
  revalidatePath("/team");
}
