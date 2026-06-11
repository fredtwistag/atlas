-- ============ session_messages (tenant-scoped + owner-only read, RLS) ============
-- The conversation transcript: one row per assistant/user turn (plan 013).
-- Privacy by design (CLAUDE.md): a same-tenant MANAGER must NOT be able to read
-- an IC's transcript. So SELECT is restricted to the session's own user_id (or a
-- Twistag cross-tenant read), NOT the broad tenant_select used elsewhere.
-- Postgres ORs multiple permissive SELECT policies together, so there is
-- deliberately no `*_tenant_select` policy here — only owner + twistag.

CREATE TABLE IF NOT EXISTS public.session_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id),
  session_id uuid NOT NULL REFERENCES public.sessions(id),
  user_id    uuid NOT NULL REFERENCES public.users(id),
  role       text NOT NULL,            -- 'assistant' | 'user'
  content    text NOT NULL,
  arc        text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ Index ============
CREATE INDEX IF NOT EXISTS session_messages_session_idx
  ON public.session_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS session_messages_tenant_idx
  ON public.session_messages(tenant_id);

-- ============ Grants ============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_messages TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- ============ RLS ============
ALTER TABLE public.session_messages ENABLE ROW LEVEL SECURITY;

-- SELECT: tenant match AND the reader is the session's own contributor. A
-- manager in the same tenant fails the user_id check → 0 rows.
CREATE POLICY "session_messages_owner_select" ON public.session_messages FOR SELECT
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    AND user_id = (auth.jwt() ->> 'user_id')::uuid
  );

-- INSERT/UPDATE/DELETE: standard tenant isolation. Writes additionally require
-- the row's user_id to be the writer (the engine only ever writes the owner's
-- own turns), so a tenant member cannot fabricate another member's transcript.
CREATE POLICY "session_messages_tenant_insert" ON public.session_messages FOR INSERT
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    AND user_id = (auth.jwt() ->> 'user_id')::uuid
  );
CREATE POLICY "session_messages_tenant_update" ON public.session_messages FOR UPDATE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "session_messages_tenant_delete" ON public.session_messages FOR DELETE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Twistag cross-tenant read (debugging / eval) — claim-gated, audited via
-- withTwistagContext. ORs with the owner policy: it does NOT widen tenant-member
-- access (a tenant member has no twistag_role claim).
CREATE POLICY "session_messages_twistag_read" ON public.session_messages FOR SELECT
  USING ((auth.jwt() ->> 'twistag_role') IS NOT NULL);
