-- ============ IC privacy acknowledgement (PRD F1.5) ============
-- Records when a participant acknowledged the privacy notice shown before their
-- first session. A privacy commitment worth a timestamp, not just UI state.
-- The existing users RLS policy set covers this column (users_tenant_update is
-- tenant-scoped); ackPrivacy() writes the user's own row under their own claims.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS privacy_ack_at timestamptz;
