"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { withServiceRole } from "@/db/client";
import { users, invitations } from "@/db/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { InviteMemberSchema } from "@/lib/invitations";
import {
  updateMemberRole,
  removeMemberRecord,
  cancelInvitation,
  getPendingInvitation,
  type Actor,
} from "@/lib/members";

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

  revalidatePath("/team");
  redirect(`/team?invited=${encodeURIComponent(email)}`);
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

/** Re-issue the Supabase auth invite for a pending invitation. */
export async function resendInviteAction(invitationId: string): Promise<void> {
  const actor = await requireManagerActor();
  const invite = await getPendingInvitation(actor, invitationId);
  if (!invite) throw new Error("not found");

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email: invite.email,
    email_confirm: true,
  });
  if (error && !/already/i.test(error.message)) {
    throw new Error(error.message);
  }
  revalidatePath("/team");
}
