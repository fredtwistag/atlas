-- ============ NO-RLS tables (Twistag-admin / service-role only) ============
CREATE TABLE IF NOT EXISTS public.tenants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text UNIQUE NOT NULL,
  name       text NOT NULL,
  segment    text NOT NULL,
  status     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata   jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id         bigserial PRIMARY KEY,
  tenant_id  uuid,
  user_id    uuid,
  action     text NOT NULL,
  target_id  text,
  metadata   jsonb DEFAULT '{}'::jsonb,
  at         timestamptz NOT NULL DEFAULT now()
);

-- ============ TENANT-SCOPED tables (RLS) ============
CREATE TABLE IF NOT EXISTS public.users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id),
  email      text NOT NULL,
  name       text NOT NULL,
  role       text NOT NULL,
  department text,
  title      text,
  opted_out  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS public.sprints (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id),
  name             text NOT NULL,
  scope_department text,
  primary_focus    text NOT NULL,
  custom_focus     text,
  start_date       date NOT NULL,
  end_date         date NOT NULL,
  cadence          text NOT NULL,
  status           text NOT NULL,
  sponsor_id       uuid REFERENCES public.users(id),
  manager_id       uuid REFERENCES public.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz
);

CREATE INDEX IF NOT EXISTS users_tenant_idx ON public.users(tenant_id);
CREATE INDEX IF NOT EXISTS sprints_tenant_idx ON public.sprints(tenant_id);

-- ============ GRANTS ============
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sprints TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ============ RLS: users ============
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_tenant_select" ON public.users FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "users_tenant_insert" ON public.users FOR INSERT
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "users_tenant_update" ON public.users FOR UPDATE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "users_tenant_delete" ON public.users FOR DELETE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "users_twistag_read" ON public.users FOR SELECT
  USING ((auth.jwt() ->> 'twistag_role') IS NOT NULL);

-- ============ RLS: sprints ============
ALTER TABLE public.sprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sprints_tenant_select" ON public.sprints FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "sprints_tenant_insert" ON public.sprints FOR INSERT
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "sprints_tenant_update" ON public.sprints FOR UPDATE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "sprints_tenant_delete" ON public.sprints FOR DELETE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "sprints_twistag_read" ON public.sprints FOR SELECT
  USING ((auth.jwt() ->> 'twistag_role') IS NOT NULL);

-- NOTE: the *_twistag_read policies are claim-gated only in slice 1. When
-- engagement_assignments lands, tighten them to the assignment join (arch §4.3).
