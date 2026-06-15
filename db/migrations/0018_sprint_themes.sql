-- EXT-1 (Tier 1) — privacy-safe sprint themes cache.
--
-- A list of theme labels (no names, no quotes) computed by recompute and
-- injected into later sessions so contributors corroborate/extend rather than
-- restate. Additive jsonb on sprints — no RLS change (inherits sprints
-- policies; tenant-readable, which is what the IC prompt needs).

ALTER TABLE public.sprints
  ADD COLUMN IF NOT EXISTS sprint_themes jsonb;
