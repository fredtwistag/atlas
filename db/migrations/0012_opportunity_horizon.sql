-- Ticket D — opportunity funding horizon.
--
-- A derived label (quick_win / strategic_bet / standard) computed in TS from
-- the dimension scores at recompute time, so the report and cards can present
-- a barbell instead of a flat ranked list. Additive + defaulted — no RLS
-- change (inherits the existing per-tenant policies on opportunities).

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS horizon text NOT NULL DEFAULT 'standard';
