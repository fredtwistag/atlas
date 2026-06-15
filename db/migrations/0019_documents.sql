-- CTX-3 — uploaded artifacts (documents) + ingestion.
--
-- Implements the documents table designed in docs/02-architecture.md. Tenant
-- users read; writes are service-role/Twistag only (uploads + ingestion run
-- service-role). `uploaded_by` and `storage_key` are nullable so a Twistag
-- text-ingest path works before the Supabase Storage upload path fills them.

CREATE TABLE IF NOT EXISTS public.documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id),
  filename       text NOT NULL,
  mime_type      text NOT NULL,
  storage_key    text,
  uploaded_by    uuid REFERENCES public.users(id),
  sprint_id      uuid REFERENCES public.sprints(id),
  status         text NOT NULL DEFAULT 'uploaded',
  extracted_text text,
  uploaded_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_tenant_idx ON public.documents(tenant_id);

GRANT SELECT ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documents_tenant_select" ON public.documents FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "documents_twistag_read" ON public.documents FOR SELECT
  USING ((auth.jwt() ->> 'twistag_role') IS NOT NULL);
