-- CTX-1 — company context store.
--
-- A structured profile of the client org (industry, business model, size,
-- known systems & pains) that later tickets inject into conversation prompts,
-- scoring, and the report (CTX-4), and that enrichment populates (CTX-2/3).
--
-- One row per tenant (tenant_id UNIQUE). Tenant users may READ their own
-- context (it is composed into IC prompts server-side, so the IC's JWT must
-- see it), but writes are service-role/Twistag only — there are deliberately
-- NO tenant insert/update/delete policies and authenticated gets SELECT only.

CREATE TABLE IF NOT EXISTS public.company_context (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL UNIQUE REFERENCES public.tenants(id),
  summary        text,
  industry       text,
  business_model text,
  size_band      text,
  revenue_band   text,
  maturity       text,
  key_systems    text[] NOT NULL DEFAULT '{}',
  known_pains    text[] NOT NULL DEFAULT '{}',
  sources        jsonb  NOT NULL DEFAULT '[]',
  status         text   NOT NULL DEFAULT 'draft',
  enriched_by    text,
  enriched_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_context_tenant_idx
  ON public.company_context(tenant_id);

-- Grants: tenant users READ only; service_role does all writes.
GRANT SELECT ON public.company_context TO authenticated;
GRANT ALL ON public.company_context TO service_role;

-- RLS: tenant read of own row + Twistag read. No tenant write policies, so
-- INSERT/UPDATE/DELETE by authenticated are denied (writes go via service_role).
ALTER TABLE public.company_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_context_tenant_select" ON public.company_context FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY "company_context_twistag_read" ON public.company_context FOR SELECT
  USING ((auth.jwt() ->> 'twistag_role') IS NOT NULL);
