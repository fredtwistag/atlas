/**
 * Session/user accessor — reads the real Supabase session and the Atlas claims
 * injected by the access-token hook (tenant_id/role/user_id, or twistag_role).
 * Server-only.
 */
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { createClient } from "./supabase/server";
import { parseClaims, decodeJwtPayload, type Claims } from "./auth-claims";
import { withTenantContext, withServiceRole } from "@/db/client";
import { users, twistagUsers } from "@/db/schema";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  title: string;
  role: string;
  kind: "twistag" | "tenant";
  tenantId?: string;
};

/** The verified claims for the current request, or null if not signed in. */
export async function getSession(): Promise<Claims> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  return parseClaims(decodeJwtPayload(session.access_token));
}

function twistagTitle(role: string): string {
  return "Twistag · " + role.replace("twistag_", "").replace("_", " ");
}

function roleTitle(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/**
 * The current user's display profile. Redirects to sign-in if there is no
 * session, or to a no-access state if the email resolves to no workspace.
 *
 * Wrapped in `React.cache` so the layout + the page it renders share a single
 * resolution per request (the layout and most pages each call this) — collapses
 * the duplicate getUser()/getSession() round-trips and the profile DB read.
 */
export const getCurrentUser = cache(async function getCurrentUser(): Promise<SessionUser> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = parseClaims(decodeJwtPayload(session?.access_token ?? ""));
  if (!claims) redirect("/sign-in?error=no-access");

  const email = user.email ?? "";

  if (claims.kind === "twistag") {
    const rows = await withServiceRole(
      { action: "session.read", actor: user.id },
      (tx) =>
        tx.select().from(twistagUsers).where(eq(twistagUsers.email, email)),
    );
    const t = rows[0];
    return {
      id: t?.id ?? user.id,
      email,
      name: t?.name ?? "Twistag",
      title: twistagTitle(claims.twistagRole),
      role: claims.twistagRole,
      kind: "twistag",
    };
  }

  const rows = await withTenantContext(claims, (tx) =>
    tx.select().from(users).where(eq(users.id, claims.userId)),
  );
  const u = rows[0];
  return {
    id: claims.userId,
    email,
    name: u?.name ?? email,
    title: u?.title ?? roleTitle(claims.role),
    role: claims.role,
    kind: "tenant",
    tenantId: claims.tenantId,
  };
});
