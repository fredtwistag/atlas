import { eq } from "drizzle-orm";
import { withTenantContext, type TenantClaims } from "@/db/client";
import { users } from "@/db/schema";

/**
 * Whether this tenant user has acknowledged the privacy notice (PRD F1.5). Read
 * under the user's own claims so RLS scopes it to their tenant. Server-only.
 */
export async function hasAckedPrivacy(claims: TenantClaims): Promise<boolean> {
  const rows = await withTenantContext(claims, (tx) =>
    tx
      .select({ privacyAckAt: users.privacyAckAt })
      .from(users)
      .where(eq(users.id, claims.userId)),
  );
  return rows[0]?.privacyAckAt != null;
}
