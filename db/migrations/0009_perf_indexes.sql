-- ============ Performance indexes (Plan 026) ============
-- Pure additive indexes for two latency-visible hot paths. No RLS, no schema,
-- no query-semantics change — only the planner gains better access paths.

-- Hottest query: current-sprint-for-tenant runs on every (app) layout render
-- (server/trpc/routers/sprint.ts currentForTenant). Under tenant RLS the rows
-- are already scoped to one tenant_id, then filtered by status != 'completed'
-- and ordered by created_at DESC. The prior index sprints_tenant_idx (0000)
-- covers only tenant_id; this composite lets the order-by + status filter be
-- index-served instead of a sort.
CREATE INDEX IF NOT EXISTS sprints_tenant_status_created_idx
  ON public.sprints (tenant_id, status, created_at DESC);

-- Audit viewer (twistag.ts auditLog): action + date filters with id-desc keyset
-- paging. This supports the common action(+at) filter combination.
CREATE INDEX IF NOT EXISTS audit_log_action_at_idx
  ON public.audit_log (action, at DESC);

-- Audit viewer actor filter is a raw JSON extraction (metadata ->> 'actor').
-- A functional/expression index makes that equality filter index-served.
CREATE INDEX IF NOT EXISTS audit_log_metadata_actor_idx
  ON public.audit_log ((metadata ->> 'actor'));
