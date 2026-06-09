-- Tenant users may read their OWN tenant row (org name/segment for the UI).
-- Tightens the slice-1 "no RLS" registry into a self-scoped read.
GRANT SELECT ON public.tenants TO authenticated;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenants_self_select" ON public.tenants FOR SELECT
  USING (id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY "tenants_twistag_read" ON public.tenants FOR SELECT
  USING ((auth.jwt() ->> 'twistag_role') IS NOT NULL);
