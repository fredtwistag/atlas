-- Plan 1 — synthesized workflow-diagram graphs.
--
-- Generated from captures at recompute time (engine in
-- services/synthesis/workflows/). Tenant users read; writes are service-role
-- only (recompute). Curated like opportunities: provisional → surfaced → hidden.

CREATE TABLE IF NOT EXISTS public.workflow_maps (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id),
  sprint_id      uuid NOT NULL REFERENCES public.sprints(id),
  kind           text NOT NULL,
  graph          jsonb NOT NULL,
  status         text NOT NULL DEFAULT 'provisional',
  opportunity_id uuid REFERENCES public.opportunities(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workflow_maps_tenant_idx
  ON public.workflow_maps(tenant_id);
CREATE INDEX IF NOT EXISTS workflow_maps_sprint_idx
  ON public.workflow_maps(sprint_id);

GRANT SELECT ON public.workflow_maps TO authenticated;
GRANT ALL ON public.workflow_maps TO service_role;

ALTER TABLE public.workflow_maps ENABLE ROW LEVEL SECURITY;

-- Tenant users only see their own surfaced/curated maps; never provisional.
CREATE POLICY "workflow_maps_tenant_select" ON public.workflow_maps FOR SELECT
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    AND status = 'surfaced'
  );

-- Twistag admins read every map (incl. provisional) for curation.
CREATE POLICY "workflow_maps_twistag_read" ON public.workflow_maps FOR SELECT
  USING ((auth.jwt() ->> 'twistag_role') IS NOT NULL);
