-- ============ Dashboard tables (all tenant-scoped, RLS per ADR-001) ============

CREATE TABLE IF NOT EXISTS public.topics (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id),
  sprint_id      uuid NOT NULL REFERENCES public.sprints(id),
  title          text NOT NULL,
  description    text,
  order_idx      integer NOT NULL,
  question_count integer NOT NULL,
  est_minutes    integer NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sprint_participants (
  tenant_id          uuid NOT NULL REFERENCES public.tenants(id),
  sprint_id          uuid NOT NULL REFERENCES public.sprints(id),
  user_id            uuid NOT NULL REFERENCES public.users(id),
  status             text NOT NULL,
  sessions_completed integer NOT NULL DEFAULT 0,
  sessions_total     integer NOT NULL DEFAULT 4,
  last_active_label  text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sprint_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id),
  sprint_id           uuid NOT NULL REFERENCES public.sprints(id),
  topic_id            uuid REFERENCES public.topics(id),
  user_id             uuid NOT NULL REFERENCES public.users(id),
  status              text NOT NULL,
  total_seconds       integer,
  messages_count      integer NOT NULL DEFAULT 0,
  capture_count       integer NOT NULL DEFAULT 0,
  completed_at        timestamptz,
  edit_window_ends_at timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.captures (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id),
  session_id   uuid REFERENCES public.sessions(id),
  user_id      uuid NOT NULL REFERENCES public.users(id),
  kind         text NOT NULL,
  summary      text NOT NULL,
  source_quote text NOT NULL,
  tags         text[] NOT NULL DEFAULT '{}',
  is_edited    boolean NOT NULL DEFAULT false,
  is_removed   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.opportunities (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES public.tenants(id),
  sprint_id               uuid NOT NULL REFERENCES public.sprints(id),
  title                   text NOT NULL,
  description             text NOT NULL,
  category                text NOT NULL,
  departments             text[] NOT NULL DEFAULT '{}',
  impact_low              integer NOT NULL,
  impact_high             integer NOT NULL,
  time_to_ship_weeks_low  integer NOT NULL,
  time_to_ship_weeks_high integer NOT NULL,
  confidence_score        integer NOT NULL,
  composite_score         numeric(3,1) NOT NULL,
  dimension_scores        jsonb NOT NULL,
  rationale               text NOT NULL,
  status                  text NOT NULL,
  contributor_count       integer NOT NULL DEFAULT 0,
  pattern_match           jsonb,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.opportunity_evidence (
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id),
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id),
  capture_id     uuid NOT NULL REFERENCES public.captures(id),
  weight         double precision NOT NULL DEFAULT 1,
  PRIMARY KEY (opportunity_id, capture_id)
);

-- ============ Indexes ============
CREATE INDEX IF NOT EXISTS topics_tenant_idx ON public.topics(tenant_id);
CREATE INDEX IF NOT EXISTS sprint_participants_tenant_idx ON public.sprint_participants(tenant_id);
CREATE INDEX IF NOT EXISTS sessions_tenant_idx ON public.sessions(tenant_id);
CREATE INDEX IF NOT EXISTS captures_tenant_idx ON public.captures(tenant_id);
CREATE INDEX IF NOT EXISTS opportunities_tenant_idx ON public.opportunities(tenant_id);
CREATE INDEX IF NOT EXISTS opportunity_evidence_tenant_idx ON public.opportunity_evidence(tenant_id);

-- ============ Grants ============
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.topics, public.sprint_participants, public.sessions, public.captures,
  public.opportunities, public.opportunity_evidence
  TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- ============ RLS: standard 4 tenant policies + twistag read, per table ============
-- topics
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "topics_tenant_select" ON public.topics FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "topics_tenant_insert" ON public.topics FOR INSERT
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "topics_tenant_update" ON public.topics FOR UPDATE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "topics_tenant_delete" ON public.topics FOR DELETE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "topics_twistag_read" ON public.topics FOR SELECT
  USING ((auth.jwt() ->> 'twistag_role') IS NOT NULL);

-- sprint_participants
ALTER TABLE public.sprint_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sprint_participants_tenant_select" ON public.sprint_participants FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "sprint_participants_tenant_insert" ON public.sprint_participants FOR INSERT
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "sprint_participants_tenant_update" ON public.sprint_participants FOR UPDATE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "sprint_participants_tenant_delete" ON public.sprint_participants FOR DELETE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "sprint_participants_twistag_read" ON public.sprint_participants FOR SELECT
  USING ((auth.jwt() ->> 'twistag_role') IS NOT NULL);

-- sessions
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions_tenant_select" ON public.sessions FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "sessions_tenant_insert" ON public.sessions FOR INSERT
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "sessions_tenant_update" ON public.sessions FOR UPDATE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "sessions_tenant_delete" ON public.sessions FOR DELETE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "sessions_twistag_read" ON public.sessions FOR SELECT
  USING ((auth.jwt() ->> 'twistag_role') IS NOT NULL);

-- captures
ALTER TABLE public.captures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "captures_tenant_select" ON public.captures FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "captures_tenant_insert" ON public.captures FOR INSERT
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "captures_tenant_update" ON public.captures FOR UPDATE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "captures_tenant_delete" ON public.captures FOR DELETE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "captures_twistag_read" ON public.captures FOR SELECT
  USING ((auth.jwt() ->> 'twistag_role') IS NOT NULL);

-- opportunities
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "opportunities_tenant_select" ON public.opportunities FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "opportunities_tenant_insert" ON public.opportunities FOR INSERT
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "opportunities_tenant_update" ON public.opportunities FOR UPDATE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "opportunities_tenant_delete" ON public.opportunities FOR DELETE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "opportunities_twistag_read" ON public.opportunities FOR SELECT
  USING ((auth.jwt() ->> 'twistag_role') IS NOT NULL);

-- opportunity_evidence
ALTER TABLE public.opportunity_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "opportunity_evidence_tenant_select" ON public.opportunity_evidence FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "opportunity_evidence_tenant_insert" ON public.opportunity_evidence FOR INSERT
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "opportunity_evidence_tenant_update" ON public.opportunity_evidence FOR UPDATE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "opportunity_evidence_tenant_delete" ON public.opportunity_evidence FOR DELETE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "opportunity_evidence_twistag_read" ON public.opportunity_evidence FOR SELECT
  USING ((auth.jwt() ->> 'twistag_role') IS NOT NULL);
