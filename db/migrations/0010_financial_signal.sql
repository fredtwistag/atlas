-- EXT-2 — financial signal at the source.
--
-- Captures gain optional structured quantified impact so scoring can compute
-- annual dollars (frequency × cost-per-incident) instead of inferring an
-- unstated salary. Sprints gain a per-role loaded hourly cost basis (set by the
-- manager at setup in EXT-2b; NULL → scoring falls back to a benchmark).
--
-- Additive + nullable only — no RLS change (columns inherit the existing
-- per-tenant policies on captures/sprints).

ALTER TABLE public.captures
  ADD COLUMN IF NOT EXISTS quantified_frequency_per_year numeric(12, 2),
  ADD COLUMN IF NOT EXISTS quantified_unit_minutes       numeric(12, 2),
  ADD COLUMN IF NOT EXISTS quantified_unit_cost_usd       numeric(14, 2),
  ADD COLUMN IF NOT EXISTS quantified_basis               text;

ALTER TABLE public.sprints
  ADD COLUMN IF NOT EXISTS cost_basis jsonb;
