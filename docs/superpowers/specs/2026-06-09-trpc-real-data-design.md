# tRPC + real tenant data (core screens) — design spec

**Date:** 2026-06-09
**Status:** Implemented (branch `backend-trpc`) — manager dashboard + opportunity detail on real data, verified end-to-end
**Owner:** fred@twistag.com
**Builds on:** DB+RLS foundation, Supabase Auth + onboarding (both on main).
**Scope decision:** core screens first — manager dashboard + opportunity detail.

---

## 1. Context & goal

The dashboards render a rich mock from `lib/data.ts`. The real DB only has
`tenants/users/sprints/twistag_users/invitations/audit_log` — the tables holding
dashboard content don't exist. This slice makes the **manager dashboard
(`/sprint/[id]`)** and **opportunity detail (`/sprint/[id]/opportunity/[oppId]`)**
render **real, tenant-scoped data** via tRPC. `/me`, report, and twistag follow next.

## 2. Goals

1. Migration `0002`: the 6 tables those screens need, RLS + adversarial tests.
2. Seed Northwind's existing demo content into those tables (its real sprint).
3. tRPC: server (`initTRPC`), tenant context from `getSession()`, `sprint` +
   `opportunity` routers, a **server-side caller** for the server components, an
   HTTP route handler, and a client provider scaffold.
4. Rewire the two screens to read via the tRPC caller (same view shapes → minimal
   page churn). `/sprint` index resolves the tenant's current sprint and redirects.

## 3. Non-goals (next slices)

- `/me`, final report, twistag cockpit rewiring; `sow_drafts`/`comments`/`documents`
  tables; opportunity scoring/clustering jobs; sprint creation; the conversation
  service writing real captures. Mocks remain for those until their slices.

## 4. Data model — migration `0002_dashboard_tables.sql`

All tenant-scoped (`tenant_id uuid NOT NULL REFERENCES tenants`, `created_at`,
RLS standard 4 policies + `*_twistag_read`, `tenant_id` index), per ADR-001:

- `topics(sprint_id, title, description, order_idx, question_count, est_minutes, template_id)`
- `sprint_participants(sprint_id, user_id, status, added_at)` — PK (sprint_id, user_id)
- `sessions(sprint_id, topic_id, user_id, status, total_seconds, messages_count,
  completed_at, edit_window_ends_at, metadata)`
- `captures(session_id, user_id, kind, summary, source_quote, tags[], is_edited,
  is_removed)` — (embedding deferred; scoring/clustering not in this slice)
- `opportunities(sprint_id, title, description, category, departments[],
  impact_cents_low, impact_cents_high, time_to_ship_weeks_low/high, confidence_score,
  composite_score numeric(3,1), dimension_scores jsonb, rationale, status,
  surfaced_at)`
- `opportunity_evidence(opportunity_id, capture_id, weight)` — PK (opportunity_id, capture_id)

Drizzle definitions added to `db/schema.ts`. Adversarial isolation tests for
`opportunities`, `sessions`, `captures` (read/insert cross-tenant blocked), reusing
the embedded-pg harness.

## 5. View shapes & mapping

The routers return the **existing `lib/types.ts` view shapes** (`Sprint` with
`topics[]`/`participants[]`, `SprintProgress`, `Opportunity` with `evidence[]` +
`dimensionScores[]`), assembled from DB rows. So the pages keep their current
rendering — only the data source changes.

- `captures.contributorRole` (shown in evidence) = the contributing user's `title`
  (role), resolved by join. Names are never surfaced (privacy by design).
- `SprintProgress` (completion %, WAC, counts, high-impact count) is **computed**
  from sessions/participants/opportunities. `signalQuality` is seeded on
  `sprints.metadata` (no scoring engine yet).
- Activity feed: derived from recently completed sessions + surfaced opportunities
  (lightweight; full event log is later).

## 6. tRPC architecture (`server/trpc/`)

- `trpc.ts` — `initTRPC.context<Context>()`; `publicProcedure`; `tenantProcedure`
  (middleware: requires `ctx.session.kind === 'tenant'`, else `UNAUTHORIZED`).
- `context.ts` — `createContext()` → `{ session: await getSession() }`.
- `routers/sprint.ts` — `currentForTenant()`, `get({id})`, `progress({id})`,
  `participants({id})`, `activity({id})`. Each runs inside `withTenantContext(session)`;
  RLS enforces tenant ownership (unknown/cross-tenant id → `NOT_FOUND`).
- `routers/opportunity.ts` — `listForSprint({sprintId})`, `get({id})` (with evidence).
- `routers/_app.ts` — `appRouter`; `server/trpc/caller.ts` — `createCallerFactory`
  for server components: `const api = await createCaller()`.
- Every procedure has an **input Zod schema**; outputs typed from the view types.
- `app/api/trpc/[trpc]/route.ts` — fetch handler (for future client use).
- `lib/trpc/react.tsx` — React Query provider scaffold (not wired into pages this
  slice; server caller is used for the rewired reads).

## 7. Page rewiring

- `app/(app)/sprint/[id]/page.tsx` — replace `db.sprint.*`/`db.opportunity.listForSprint`
  with `api.sprint.get/progress/participants/activity` + `api.opportunity.listForSprint`.
- `app/(app)/sprint/[id]/opportunity/[oppId]/page.tsx` — `api.opportunity.get`.
  `sowDraftFor()` (deterministic generator) stays until the SOW slice.
- `app/(app)/sprint/page.tsx` (new) — `api.sprint.currentForTenant()` →
  `redirect('/sprint/<id>')`; empty state if the tenant has no sprint.
- `components/AppSidebar.tsx` — point the manager/dashboard link at `/sprint`
  (was the hardcoded mock id). Minimal one-line change.
- `lib/data.ts` keeps serving the screens not yet rewired (/me, report, twistag).

## 8. Seed (`db/seed-dashboard.ts`, `npm run db:seed:dashboard`)

Idempotent. For the seeded **Northwind** tenant + users, insert one real sprint
(fixed UUID for stable links/tests) with its topics, participants, sessions,
opportunities (with `dimension_scores`), captures, and evidence — mirroring the
current `lib/data.ts` Northwind content so the live demo becomes real data. Helios
(from the auth slice) has no sprint → exercises the empty state.

## 9. Testing

- **Integration (embedded-pg):** adversarial isolation for `opportunities`/`sessions`/
  `captures`; plus a router test — seed two tenants, assert `sprint.get`/
  `opportunity.listForSprint` under tenant A's session never returns tenant B's rows
  (via the caller with a stubbed context).
- **Unit:** the progress/stats computation (pure function over rows) + activity derivation.
- Existing 26 unit + 17 integration stay green; lint/build green.

## 10. Risks

- **Shape drift** between DB rows and view types → centralize mapping in the routers;
  type the outputs from `lib/types.ts`.
- **N+1 / latency** assembling Sprint (topics+participants+sessions) → batch with a few
  queries inside one `withTenantContext` transaction, not per-row.
- **Caller context in server components** → `createContext()` reads cookies via the
  Supabase server client; ensure the caller is created per-request (not module-global).
- **Sidebar edit collision** with parallel frontend work → one-line link change in the
  worktree; merge carefully (worktree isolation).

## 11. Success criteria

- Signed in as the Northwind manager, `/sprint` → the real sprint dashboard with real
  participants/opportunities; opportunity detail shows real evidence + scores.
- A different tenant cannot load Northwind's sprint/opportunities (RLS + adversarial tests).
- New-table adversarial tests + router isolation test green; full gate green.
- `lib/data.ts` still powers the not-yet-rewired screens; no regressions there.

## 12. Out of scope / next

`/me`, report, twistag rewiring; sow/comments/documents; scoring jobs; sprint creation.
