/**
 * Session/user accessor — the single seam auth will plug into.
 * Today it returns the demo IC; in the backend phase this reads the Stytch JWT
 * (tenant_id, user_id, role) per docs/02-architecture.md §3.2. Async on purpose
 * so the swap is a no-op at call sites.
 */
import { currentIc } from "./data";
import type { Role, User } from "./types";

export async function getCurrentUser(): Promise<User> {
  return currentIc;
}

export async function getSession(): Promise<{
  user: User;
  tenantId: string;
  role: Role;
}> {
  const user = currentIc;
  return { user, tenantId: "spr-northwind-q2", role: user.role };
}
