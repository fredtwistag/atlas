-- ============ Twistag staff registry (no RLS — service-role / admin only) ============
CREATE TABLE IF NOT EXISTS public.twistag_users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text UNIQUE NOT NULL,
  name       text NOT NULL,
  role       text NOT NULL,                 -- twistag_admin | twistag_lead | twistag_account_manager
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ Invitations (tenant-scoped, RLS) ============
CREATE TABLE IF NOT EXISTS public.invitations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id),
  email           text NOT NULL,
  role            text NOT NULL,            -- manager | sponsor | ic
  status          text NOT NULL DEFAULT 'pending',  -- pending | accepted | revoked
  invited_by_kind text NOT NULL,            -- twistag | user
  invited_by_id   uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  accepted_at     timestamptz,
  UNIQUE (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS invitations_tenant_idx ON public.invitations(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invitations_tenant_select" ON public.invitations FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "invitations_tenant_insert" ON public.invitations FOR INSERT
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "invitations_tenant_update" ON public.invitations FOR UPDATE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "invitations_tenant_delete" ON public.invitations FOR DELETE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "invitations_twistag_read" ON public.invitations FOR SELECT
  USING ((auth.jwt() ->> 'twistag_role') IS NOT NULL);

-- ============ Custom Access Token Hook ============
-- Supabase Auth calls this at token-mint time to inject our claims.
-- SECURITY DEFINER so the lookups bypass RLS (the hook runs at token-mint time,
-- before any claims exist). Runs as the function owner (the migration role, which
-- owns the tables). search_path pinned for safety — all refs are schema-qualified.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_email   text := event -> 'claims' ->> 'email';
  v_claims  jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  t_role    text;
  u_id      uuid;
  u_tenant  uuid;
  u_role    text;
BEGIN
  -- Twistag staff first (cross-tenant; no tenant_id claim).
  SELECT role INTO t_role FROM public.twistag_users WHERE email = v_email LIMIT 1;
  IF t_role IS NOT NULL THEN
    v_claims := v_claims || jsonb_build_object('twistag_role', t_role);
    RETURN jsonb_set(event, '{claims}', v_claims);
  END IF;

  -- Tenant app user.
  SELECT id, tenant_id, role INTO u_id, u_tenant, u_role
  FROM public.users WHERE email = v_email LIMIT 1;
  IF u_id IS NOT NULL THEN
    v_claims := v_claims || jsonb_build_object(
      'tenant_id', u_tenant,
      'role', u_role,
      'user_id', u_id
    );
    RETURN jsonb_set(event, '{claims}', v_claims);
  END IF;

  -- Unknown email → pass through unchanged.
  RETURN event;
END;
$$;

-- Only Supabase Auth may run the hook; it needs to read the lookup tables.
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT SELECT ON public.users TO supabase_auth_admin;
GRANT SELECT ON public.twistag_users TO supabase_auth_admin;
