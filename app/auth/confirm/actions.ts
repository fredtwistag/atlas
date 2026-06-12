"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { decodeJwtPayload, parseClaims } from "@/lib/auth-claims";
import { landingPathFor } from "@/lib/landing";
import { markInvitationAccepted } from "@/lib/invitation-accept";

/**
 * Verify an invite/magic-link token and finish signing the invitee in. Invoked
 * by the /auth/confirm button — a POST, so mail-scanner prefetches (which only
 * GET the page) never consume the one-time token. Expired/used tokens bounce to
 * /sign-in?error=auth, where they can request a fresh link.
 */
export async function confirmInvite(formData: FormData): Promise<void> {
  const tokenHash = String(formData.get("token_hash") ?? "");
  if (!tokenHash) redirect("/sign-in?error=auth");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: tokenHash,
  });
  if (error) redirect("/sign-in?error=auth");

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = parseClaims(decodeJwtPayload(session?.access_token ?? ""));

  if (claims?.kind === "tenant") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // Best-effort: a failed accept must not strand a freshly signed-in user.
    // Captured outside the catch so a Next redirect() (which throws) isn't
    // swallowed.
    let result: Awaited<ReturnType<typeof markInvitationAccepted>> = "none";
    try {
      result = await markInvitationAccepted(
        {
          tenantId: claims.tenantId,
          userId: claims.userId,
          role: claims.role,
        },
        user?.email ?? "",
      );
    } catch {
      // The user is signed in; the invitation flips on a later visit anyway.
    }
    // Plan 025: an expired *pending* invite must not grant access. Sign out and
    // bounce with friendly copy. Only a pending-but-expired row yields "expired";
    // an already-accepted member returns "none" and proceeds normally.
    if (result === "expired") {
      await supabase.auth.signOut();
      redirect("/sign-in?error=invite-expired");
    }
  }

  const role =
    claims?.kind === "twistag"
      ? claims.twistagRole
      : claims?.kind === "tenant"
        ? claims.role
        : "";
  redirect(landingPathFor(role));
}
