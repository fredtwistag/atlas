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
