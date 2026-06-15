-- Ticket B — stakeholder map.
--
-- Role-level stakeholders (decision_maker / blocker / adopter) derived from
-- decision/handoff captures + roster, with the opportunities each gates.
-- ROLE LABELS ONLY — never an individual name. Service-role writes; tenant read.

CREATE TABLE IF NOT EXISTS public.stakeholders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id),
  sprint_id  uuid NOT NULL REFERENCES public.sprints(id),
  role_label text NOT NULL,
  department text,
  type       text NOT NULL,
  summary    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stakeholder_opportunity (
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id),
  stakeholder_id uuid NOT NULL REFERENCES public.stakeholders(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id),
  PRIMARY KEY (stakeholder_id, opportunity_id)
);

CREATE INDEX IF NOT EXISTS stakeholders_tenant_idx ON public.stakeholders(tenant_id);
CREATE INDEX IF NOT EXISTS stakeholders_sprint_idx ON public.stakeholders(sprint_id);
CREATE INDEX IF NOT EXISTS stakeholder_opportunity_tenant_idx
  ON public.stakeholder_opportunity(tenant_id);

GRANT SELECT ON public.stakeholders, public.stakeholder_opportunity TO authenticated;
GRANT ALL ON public.stakeholders, public.stakeholder_opportunity TO service_role;

ALTER TABLE public.stakeholders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stakeholders_tenant_select" ON public.stakeholders FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "stakeholders_twistag_read" ON public.stakeholders FOR SELECT
  USING ((auth.jwt() ->> 'twistag_role') IS NOT NULL);

ALTER TABLE public.stakeholder_opportunity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stakeholder_opportunity_tenant_select" ON public.stakeholder_opportunity FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "stakeholder_opportunity_twistag_read" ON public.stakeholder_opportunity FOR SELECT
  USING ((auth.jwt() ->> 'twistag_role') IS NOT NULL);
