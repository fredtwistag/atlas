import { sql } from "drizzle-orm";
import { withTenantContext, type TenantClaims } from "@/db/client";

/**
 * Outcome of an acceptance attempt:
 *  - "accepted": a fresh, unexpired pending invitation was flipped to accepted.
 *  - "expired":  a pending invitation existed but its window had passed — the
 *                ONLY case the callback turns into a friendly /sign-in bounce.
 *  - "none":     nothing pending matched. This is the steady state for an
 *                already-accepted user signing in again (status is 'accepted',
 *                not 'pending'), and also the cross-tenant / never-invited case.
 *                It must NOT be treated as an error, so existing users sign in.
 */
export type AcceptResult = "accepted" | "expired" | "none";

/**
 * Idempotently mark this user's pending invitation accepted, running under the
 * user's OWN claims so the `invitations_tenant_update` RLS policy authorizes the
 * write — NO service role. A cross-tenant attempt updates 0 rows (RLS USING
 * fails the match); a second sign-in is a 0-row no-op (status already
 * 'accepted'). Email match is case-insensitive.
 *
 * Expiry (plan 025): the flip requires `status = 'pending' AND expires_at > now()`.
 * The check is scoped to PENDING rows only — an already-accepted user has no
 * pending row, so this can never break sign-in for existing members (the result
 * is "none", which the callback ignores). A pending-but-expired row yields
 * "expired" so the callback can land the user on /sign-in with friendly copy.
 *
 * Called from /auth/confirm and /auth/callback once tenant claims are known.
 */
export async function markInvitationAccepted(
  claims: TenantClaims,
  email: string,
): Promise<AcceptResult> {
  if (!email) return "none";
  return withTenantContext(claims, async (tx) => {
    // Flip only a still-valid pending invite. RETURNING tells us it happened.
    const accepted = await tx.execute(sql`
      UPDATE public.invitations
      SET status = 'accepted', accepted_at = now()
      WHERE lower(email) = lower(${email})
        AND status = 'pending'
        AND expires_at IS NOT NULL
        AND expires_at > now()
      RETURNING id
    `);
    if (accepted.length > 0) return "accepted";

    // Nothing flipped. Distinguish "pending but expired" (friendly bounce) from
    // "no pending row at all" (already accepted / not invited → silent no-op).
    const expired = await tx.execute(sql`
      SELECT 1 FROM public.invitations
      WHERE lower(email) = lower(${email})
        AND status = 'pending'
        AND (expires_at IS NULL OR expires_at <= now())
      LIMIT 1
    `);
    return expired.length > 0 ? "expired" : "none";
  });
}
