import { sql } from "drizzle-orm";
import { withTenantContext, type TenantClaims } from "@/db/client";

/**
 * Idempotently mark this user's pending invitation accepted, running under the
 * user's OWN claims so the `invitations_tenant_update` RLS policy authorizes the
 * write — NO service role. A cross-tenant attempt updates 0 rows (RLS USING
 * fails the match); a second sign-in is a 0-row no-op (status already
 * 'accepted'). Email match is case-insensitive.
 *
 * Called from /auth/confirm and /auth/callback once tenant claims are known.
 */
export async function markInvitationAccepted(
  claims: TenantClaims,
  email: string,
): Promise<void> {
  if (!email) return;
  await withTenantContext(claims, async (tx) => {
    await tx.execute(sql`
      UPDATE public.invitations
      SET status = 'accepted', accepted_at = now()
      WHERE lower(email) = lower(${email}) AND status = 'pending'
    `);
  });
}
