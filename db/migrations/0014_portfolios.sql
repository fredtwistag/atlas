-- Ticket A — Pilot Portfolio Designer.
--
-- A curated 3-5 opportunity portfolio per sprint (a recommendation, not a
-- leaderboard) + the LLM narrative that frames it. Generated as `draft` by
-- recompute; Twistag surfaces it to the sponsor (the "Twistag-curated first"
-- decision). Writes are service-role/Twistag only — tenant users read.

CREATE TABLE IF NOT EXISTS public.portfolios (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id),
  sprint_id  uuid NOT NULL UNIQUE REFERENCES public.sprints(id),
  narrative  text NOT NULL DEFAULT '',
  status     text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.portfolio_items (
  portfolio_id        uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  opportunity_id      uuid NOT NULL REFERENCES public.opportunities(id),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id),
  sequence_order      integer NOT NULL,
  inclusion_rationale text NOT NULL DEFAULT '',
  PRIMARY KEY (portfolio_id, opportunity_id)
);

CREATE INDEX IF NOT EXISTS portfolios_tenant_idx ON public.portfolios(tenant_id);
CREATE INDEX IF NOT EXISTS portfolio_items_tenant_idx ON public.portfolio_items(tenant_id);

-- Grants: tenant users read; service_role writes (recompute + curation).
GRANT SELECT ON public.portfolios, public.portfolio_items TO authenticated;
GRANT ALL ON public.portfolios, public.portfolio_items TO service_role;

-- RLS: tenant read of own rows + Twistag read. No tenant write policies, so
-- writes go through service_role (recompute / curation procedure).
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portfolios_tenant_select" ON public.portfolios FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "portfolios_twistag_read" ON public.portfolios FOR SELECT
  USING ((auth.jwt() ->> 'twistag_role') IS NOT NULL);

ALTER TABLE public.portfolio_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portfolio_items_tenant_select" ON public.portfolio_items FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "portfolio_items_twistag_read" ON public.portfolio_items FOR SELECT
  USING ((auth.jwt() ->> 'twistag_role') IS NOT NULL);
