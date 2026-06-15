-- Ticket F — current-state systems & shadow-IT inventory.
--
-- Clustered from tooling/workaround captures at recompute time. Tenant users
-- read; writes are service-role only (recompute). Evidence join mirrors
-- opportunity_evidence.

CREATE TABLE IF NOT EXISTS public.system_inventory_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id),
  sprint_id  uuid NOT NULL REFERENCES public.sprints(id),
  name       text NOT NULL,
  category   text NOT NULL,
  summary    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.system_inventory_evidence (
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id),
  item_id    uuid NOT NULL REFERENCES public.system_inventory_items(id) ON DELETE CASCADE,
  capture_id uuid NOT NULL REFERENCES public.captures(id),
  PRIMARY KEY (item_id, capture_id)
);

CREATE INDEX IF NOT EXISTS system_inventory_items_tenant_idx
  ON public.system_inventory_items(tenant_id);
CREATE INDEX IF NOT EXISTS system_inventory_items_sprint_idx
  ON public.system_inventory_items(sprint_id);
CREATE INDEX IF NOT EXISTS system_inventory_evidence_tenant_idx
  ON public.system_inventory_evidence(tenant_id);

GRANT SELECT ON public.system_inventory_items, public.system_inventory_evidence
  TO authenticated;
GRANT ALL ON public.system_inventory_items, public.system_inventory_evidence
  TO service_role;

ALTER TABLE public.system_inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "system_inventory_items_tenant_select" ON public.system_inventory_items FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "system_inventory_items_twistag_read" ON public.system_inventory_items FOR SELECT
  USING ((auth.jwt() ->> 'twistag_role') IS NOT NULL);

ALTER TABLE public.system_inventory_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "system_inventory_evidence_tenant_select" ON public.system_inventory_evidence FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "system_inventory_evidence_twistag_read" ON public.system_inventory_evidence FOR SELECT
  USING ((auth.jwt() ->> 'twistag_role') IS NOT NULL);
