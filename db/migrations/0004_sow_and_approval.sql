-- ============ Approval columns on opportunities ============
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.users(id);

-- ============ sow_drafts (tenant-scoped, RLS per ADR-001) ============
CREATE TABLE IF NOT EXISTS public.sow_drafts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id),
  opportunity_id  uuid NOT NULL REFERENCES public.opportunities(id),
  sprint_id       uuid NOT NULL REFERENCES public.sprints(id),
  title           text NOT NULL,
  scope           text NOT NULL,
  inclusions      text[] NOT NULL DEFAULT '{}',
  exclusions      text[] NOT NULL DEFAULT '{}',
  team            jsonb NOT NULL,
  duration_weeks  integer NOT NULL,
  price_usd       integer NOT NULL,
  success_metrics text[] NOT NULL DEFAULT '{}',
  status          text NOT NULL DEFAULT 'draft',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sow_drafts_tenant_idx ON public.sow_drafts(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sow_drafts TO authenticated;
GRANT ALL ON public.sow_drafts TO service_role;

ALTER TABLE public.sow_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sow_drafts_tenant_select" ON public.sow_drafts FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "sow_drafts_tenant_insert" ON public.sow_drafts FOR INSERT
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "sow_drafts_tenant_update" ON public.sow_drafts FOR UPDATE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "sow_drafts_tenant_delete" ON public.sow_drafts FOR DELETE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "sow_drafts_twistag_read" ON public.sow_drafts FOR SELECT
  USING ((auth.jwt() ->> 'twistag_role') IS NOT NULL);
