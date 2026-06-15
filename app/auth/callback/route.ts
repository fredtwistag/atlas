import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decodeJwtPayload, parseClaims } from "@/lib/auth-claims";
import { landingPathFor } from "@/lib/landing";
import { markInvitationAccepted } from "@/lib/invitation-accept";
import { safeNext } from "./safe-next";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const explicitNext = searchParams.get("next");
  const supabase = await createClient();

  // Magic-link flow carries a code to exchange. The code-entry flow (sign-in
  // page → verifyOtp client-side → assign /auth/callback) arrives with a session
  // already set and no code — fall through to the session check below.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/sign-in?error=auth`);
    }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return NextResponse.redirect(`${origin}/sign-in?error=auth`);
  }

  const claims = parseClaims(decodeJwtPayload(session.access_token));

  // Flip a pending invitation to accepted on first sign-in, under the user's own
  // claims (RLS-authorized, no service role). Idempotent; best-effort.
  //
  // Plan 025: an expired *pending* invite must not grant access. We sign the
  // user out and bounce to /sign-in with friendly copy. This only fires for a
  // pending-but-expired row — an already-accepted member returns "none" and
  // sails through, so existing sign-ins are never broken.
  if (claims?.kind === "tenant") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    try {
      const result = await markInvitationAccepted(
        {
          tenantId: claims.tenantId,
          userId: claims.userId,
          role: claims.role,
        },
        user?.email ?? "",
      );
      if (result === "expired") {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/sign-in?error=invite-expired`);
      }
    } catch {
      // Non-fatal: the user is signed in; the invite flips on a later visit.
    }
  }

  let dest = safeNext(explicitNext);
  if (!dest) {
    const role =
      claims?.kind === "twistag"
        ? claims.twistagRole
        : claims?.kind === "tenant"
          ? claims.role
          : "";
    dest = landingPathFor(role);
  }
  return NextResponse.redirect(`${origin}${dest}`);
}
