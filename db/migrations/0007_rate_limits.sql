-- ============ rate_limits: fixed-window limiter (INFRASTRUCTURE, not tenant data) ============
-- Backs lib/rate-limit.ts. Deliberately has NO tenant_id and is NOT exposed to
-- clients: it is service-role-only, like audit_log. `key` is a namespaced
-- string (e.g. "otp-verify:{email}", "signin-email-ip:{ip}"), so rows are not
-- scoped to a tenant and must never be readable via tenant/twistag context.
--
-- Fixed-window counting: one row per key. `window_starts_at` is the start of the
-- current window; `count` is the number of consumes inside it. The limiter rolls
-- the window over atomically in a single INSERT ... ON CONFLICT (see consume()).
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key               text PRIMARY KEY,
  window_starts_at  timestamptz NOT NULL DEFAULT now(),
  count             integer NOT NULL DEFAULT 0
);

-- For periodic cleanup of stale windows (optional maintenance, not on the hot path).
CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON public.rate_limits(window_starts_at);

-- ============ Grants ============
-- service_role only. We deliberately do NOT grant to anon/authenticated: this is
-- infrastructure state, never client-readable. (service_role already has BYPASSRLS
-- and ALL on existing tables via 0000, but new tables need an explicit grant.)
GRANT ALL ON public.rate_limits TO service_role;

-- ============ RLS: enabled with NO policies ============
-- Enabling RLS with zero permissive policies denies all access to anon/authenticated
-- (and the twistag claim path) by default, so selecting through withTenantContext /
-- withTwistagContext returns zero rows. service_role bypasses RLS and is the only
-- way in — matching the audit_log infrastructure pattern. No tenant or twistag
-- policy is created on purpose.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
