"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { withServiceRole } from "@/db/client";
import { users, invitations } from "@/db/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { InviteMemberSchema } from "@/lib/invitations";

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
