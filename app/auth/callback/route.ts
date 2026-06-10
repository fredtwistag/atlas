import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decodeJwtPayload, parseClaims } from "@/lib/auth-claims";
import { landingPathFor } from "@/lib/landing";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const explicitNext = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      let dest = explicitNext;
      if (!dest) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const claims = parseClaims(
          decodeJwtPayload(session?.access_token ?? ""),
        );
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
  }
  return NextResponse.redirect(`${origin}/sign-in?error=auth`);
}
