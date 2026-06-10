import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

type TenantSession = {
  kind: "tenant";
  tenantId: string;
  role: string;
  userId: string;
};

/** Require any tenant session. Non-tenant (twistag) → /admin; none → /sign-in. */
export async function requireTenantSession(): Promise<TenantSession> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (session.kind !== "tenant") redirect("/admin");
  return session;
}

/** Require a manager/sponsor tenant session. ICs → /me. */
export async function requireManagerOrSponsor(): Promise<TenantSession> {
  const session = await requireTenantSession();
  if (!(session.role === "manager" || session.role === "sponsor")) {
    redirect("/me");
  }
  return session;
}

type TwistagSession = { kind: "twistag"; twistagRole: string; userId: string };

/** Require a Twistag (cross-tenant) session. Tenant users → /me; none → /sign-in. */
export async function requireTwistagSession(): Promise<TwistagSession> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (session.kind !== "twistag") redirect("/me");
  return session;
}
