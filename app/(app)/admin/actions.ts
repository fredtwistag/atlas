"use server";

import { createElement } from "react";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { withServiceRole } from "@/db/client";
import { tenants, users, invitations } from "@/db/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { InviteOrgSchema } from "@/lib/invitations";
import { generateInviteLink } from "@/services/email/invite-link";
import { sendEmail } from "@/services/email/send";
import { InviteEmail, inviteSubject } from "@/emails/InviteEmail";

/** Super-admin creates an organization (tenant) and invites its manager. */
export async function inviteOrganization(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session || session.kind !== "twistag") {
    throw new Error("forbidden");
  }

  const parsed = InviteOrgSchema.safeParse({
    orgName: formData.get("orgName"),
    orgSlug: formData.get("orgSlug"),
    segment: formData.get("segment"),
    managerName: formData.get("managerName"),
    managerEmail: formData.get("managerEmail"),
  });
  if (!parsed.success) {
    redirect("/admin?error=invalid");
  }
  const { orgName, orgSlug, segment, managerName, managerEmail } = parsed.data;

  await withServiceRole(
    { action: "org.invite", actor: session.userId },
    async (tx) => {
      const [t] = await tx
        .insert(tenants)
        .values({
          slug: orgSlug,
          name: orgName,
          segment,
          status: "onboarding",
        })
        .returning();
      await tx.insert(users).values({
        tenantId: t.id,
        email: managerEmail,
        name: managerName,
        role: "manager",
      });
      await tx.insert(invitations).values({
        tenantId: t.id,
        email: managerEmail,
        role: "manager",
        invitedByKind: "twistag",
        invitedById: session.userId,
      });
    },
  );

  // Create the Supabase auth user so the manager can sign in (idempotent).
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email: managerEmail,
    email_confirm: true,
  });
  if (error && !/already/i.test(error.message)) {
    throw new Error(error.message);
  }

  // Send the manager their "workspace is ready" invite. The tenant + rows are
  // already saved, so a send failure only changes the redirect (retry by
  // re-inviting the org, or the manager can request a sign-in link directly).
  let delivered = true;
  try {
    const confirmUrl = await generateInviteLink(managerEmail);
    await sendEmail({
      to: managerEmail,
      subject: inviteSubject("manager", "The Atlas team", orgName),
      react: createElement(InviteEmail, {
        role: "manager",
        orgName,
        inviterName: "The Atlas team",
        confirmUrl,
      }),
    });
  } catch {
    delivered = false;
  }

  revalidatePath("/admin");
  redirect(
    delivered
      ? `/admin?invited=${encodeURIComponent(managerEmail)}`
      : "/admin?error=email",
  );
}
