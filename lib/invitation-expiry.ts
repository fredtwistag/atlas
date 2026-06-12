/**
 * Invitation expiry policy (plan 025). One source of truth for the 14-day window
 * so every creation site and the acceptance check agree. If invites later carry
 * in-app tokens, expiry moves to the token layer but this column stays
 * authoritative (plan 025 maintenance notes).
 */
const DAY_MS = 86_400_000;

/** How long a fresh (or resent) invitation stays acceptable. */
export const INVITE_EXPIRY_DAYS = 14;

/** The `expires_at` to stamp on a new or resent invitation: now + 14 days. */
export function inviteExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + INVITE_EXPIRY_DAYS * DAY_MS);
}
