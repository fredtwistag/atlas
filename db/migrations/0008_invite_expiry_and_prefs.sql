-- ============ Invitation expiry (plan 025) ============
-- Invitations were single-use but immortal: a leaked link worked weeks later,
-- including for members a manager had since removed and re-invited. Add an
-- expiry the acceptance path enforces. Rides the existing invitations RLS
-- policies (no policy changes) — it's just another column on a tenant-scoped row.
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Backfill existing PENDING rows to created_at + 14 days so they keep a sane,
-- finite life rather than NULL (which the acceptance check would treat as
-- expired). Accepted/cancelled rows don't need it — they can never be accepted.
UPDATE public.invitations
  SET expires_at = created_at + interval '14 days'
  WHERE expires_at IS NULL AND status = 'pending';

-- ============ Nudge opt-out preference (plan 025) ============
-- GDPR Art. 21 objection right: an IC can turn off manager nudges + system
-- reminders. Default true (opted in) so existing behavior is unchanged. Rides
-- the existing users RLS policies (no policy changes).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS allow_nudges boolean NOT NULL DEFAULT true;
