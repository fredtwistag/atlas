# Atlas — End-to-End Journey Audit & Plumbing Super-Plan

**Date:** 2026-06-09
**Author:** fred@twistag.com (via Claude)
**Method:** Drove every role's user journeys in a real browser (dev server + Supabase dev DB), signing in as each persona via `/sign-in/dev`, observing renders / redirects / console + server errors. Cross-checked against source.
**Goal:** Find where flows break or hit mock/dead plumbing, and produce a prioritized fix plan to do **before** any LLM / email / external-integration work.

---

## TL;DR

The backend slices (RLS, auth, tRPC, sprint lifecycle) are solid and the **happy paths work on real data** — launch a sprint, do sessions, complete them, see the report and cockpit. But the audit surfaced **one critical infra bug that makes the whole app flaky**, a **consistent authorization gap**, and several **half-wired loops** that are still mock (approve→SOW, nudges, capture editing) plus **stale hardcoded links** that 404.

Fix order: **P0 connection pooling → P1 auth gating + persist the approve/SOW loop + wire the mock pages to real data → P2 dead links & cockpit drill-in → then** LLM/email/integration.

---

## What works (verified on real data)

| Journey | Status |
|---|---|
| Marketing landing `/`, `/pricing` | ✅ renders |
| Dev sign-in (all personas) + magic-link/auth callback | ✅ |
| Super admin `/admin` — org list + invite-org form | ✅ real |
| Manager: `/sprint` → dashboard, team page, **launch a sprint** | ✅ real (launch persists: created a fresh Helios sprint + sessions) |
| IC: `/me` real sessions, run a session, **complete** (writes status + edit window + progress) | ✅ real |
| Final report `/sprint/[id]/report` | ✅ real |
| Twistag cockpit `/twistag` cross-tenant health | ✅ real (incl. no-sprint tenant) |
| Opportunity detail (evidence/patterns/discussion tabs) | ✅ renders real data |

---

## Findings (prioritized)

### P0 — Critical (app-wide flakiness; fix first)

**C1. DB connection-pool exhaustion → intermittent 500s everywhere.**
- **Symptom:** `PostgresError (EMAXCONNSESSION): max clients reached in session mode - pool_size: 15`. During the audit, normal navigation (esp. the manager dashboard) repeatedly 500'd; only a server restart + wait recovered it.
- **Root cause:** `DATABASE_URL` points at the Supabase **session-mode pooler** (`...pooler.supabase.com:5432`). Session mode pins one upstream connection per client for its whole life. The `postgres` client in `db/client.ts` uses `{ max: 10 }` with **no `idle_timeout`/`max_lifetime`**, so idle connections accumulate to the 15-client cap. Worsened by **~5 concurrent DB contexts per dashboard load** (layout `getCurrentUser` + `sprint.get` + `sprint.progress` + `opportunity.listForSprint` + `sprint.activity`, each opening its own `withTenantContext` transaction).
- **Impact:** Flaky in dev; **would be far worse on Vercel serverless** (every lambda opens its own pool). This undermines every other journey.
- **Fix:**
  1. Use the Supabase **transaction-mode pooler (`:6543`)** for the app, with `prepare: false` in the postgres-js client (transaction mode disallows prepared statements). Keep session-mode (`:5432`) only for migrations (`db/migrate.ts`).
  2. Tune the client: lower `max` (e.g. 1–5 for serverless), add `idle_timeout` (e.g. 20s) and `max_lifetime`.
  3. Reduce contexts-per-request: collapse the dashboard's multiple `withTenantContext` calls into **one** transaction that runs all reads (one connection per request instead of ~5).

### P1 — High (security + core product loops)

**H1. Authorization gating is per-page and inconsistent.**
- `/me` and `/sprint/[id]` (manager dashboard), plus `report` / `opportunity` / `nudge`, have **no `session.kind`/role guard** (confirmed in source).
  - A **twistag** (or non-tenant) session hitting `/me` or `/sprint/[id]` throws `UNAUTHORIZED` in the tenant procedure → **500** instead of a redirect (observed `UNAUTHORIZED at IcHomePage`). Contrast `/sprint` and `/team`, which guard correctly.
  - These pages use `tenantProcedure` (any tenant role), so an **IC can load the manager dashboard / report / opportunity / nudge views** — seeing colleague progress by name, all opportunities, etc. (authz gap; note privacy rules in CLAUDE.md).
- **Fix:** Centralize gating — a shared `requireTenant()` / `requireManager()` helper (or layout-level role gate) used by every protected page; manager-only pages should use a manager-scoped procedure, not `tenantProcedure`.

**H2. The approve → SOW → FDE loop is entirely mock (no persistence).**
- Clicking **"Approve for FDE engagement"** shows a SOW draft and a **"Send to Twistag"** button, but it's pure client state: the SOW comes from `sowDraftFor()` in `lib/data.ts`, the URL never changes, and **there is no `opportunity.approveForFde` mutation** (router only has `listForSprint` + `get`).
- **Consequence:** opportunity `status` never becomes `approved`; the **cockpit "Approved for FDE" count is permanently 0**; "Send to Twistag" is a no-op. This is core product value ("auto-drafted SOWs that kick off Twistag FDE engagements").
- **Fix (plumbing now; doc generation later):** add `opportunity.approveForFde` (+ status transition + persisted SOW record/table), wire the button to it, and surface real approved counts. Actual SOW *content generation* can stay templated until the LLM slice.

**H3. Nudge page 404s on real data.**
- `/sprint/[id]/nudge/[participantId]` returns "We couldn't find that page" for a real participant uuid — it's still mock-backed (`lib/data`). The nudge **action isn't implemented** either (ties to email/Inngest).
- **Fix:** rewire the page to real participant data via tRPC; the *send* depends on the email work (P-after).

**H4. Capture edit/review window 404s on real data.**
- `/me/sessions/[id]/edit` returns notFound for a real session id (mock-backed `db.session.get`). This is the privacy promise ("edit or remove anything you said for 7 days").
- **Fix:** rewire to real `session.get` + a real captures query. (Capture *content* depends on the LLM extraction slice, but the page + edit/remove plumbing should be real.)

### P2 — Medium (dead links, dead-ends, UX)

**M1. Stale `spr-northwind-q2` hardcoded links → 404.** The app **sidebar** (opportunity/report/nudge nav) and the **marketing landing** link to the old mock slug `spr-northwind-q2` (real id is a uuid) → notFound. Sidebar should derive the current sprint id; marketing demo links should point at a real seeded id or a guarded demo route.

**M2. Twistag cockpit is a dead-end.** No client drill-in (`clientRowLinks: 0`) — Twistag staff see health but can't open a client's sprint/report/opportunities. Sidebar items (Opportunities / Engagements / Pattern library / Portfolio metrics / Needs attention) are **non-links with hardcoded counts** (47/8/19). Needs a twistag-scoped read-through (a `twistagProcedure` sprint/opportunity reader) + real or removed nav.

**M3. Sponsor has no distinct journey.** Sponsor (Dana) lands on `/team` and has identical manager access; there's no sponsor-specific approval authority/landing. Decide sponsor's intended role (likely: lands on report, holds approval authority).

**M4. `/admin` org cards aren't links.** Super admin can't navigate into an org from the list (only the cross-tenant cockpit exists).

### P3 — Low / cosmetic

**L1. Sponsor attribution bug** (already flagged as background task `task_a6b1d026`): report/dashboard show an IC as "Sponsor" because `sprint.get` resolves sponsor/manager only among participants, but the seed never adds them as participants → falls back to `participants[0]`.

**L2. Dev-only stale `.next` cache** produced a `__webpack_require__.n is not a function` error boundary once; cleared by removing `.next`. Not a code bug.

---

## The Super-Plan (sequenced)

### Phase 0 — Stop the bleeding (infra)  ⟵ do first
- **C1**: switch app to transaction pooler `:6543` + `prepare:false`; tune `max`/`idle_timeout`/`max_lifetime`; reserve `:5432` for migrations. Collapse the dashboard's ~5 contexts into a single transaction. Add a tiny load test (N concurrent dashboard loads) to prove no `EMAXCONNSESSION`.

### Phase 1 — Trust & core loops (plumbing, no external deps)
- **H1**: centralize auth/role gating; convert manager-only pages to a manager-scoped procedure; make non-tenant hits redirect, not 500.
- **H2**: `opportunity.approveForFde` mutation + status transition + persisted SOW record; wire the button; real cockpit "approved" counts.
- **H4 / H3 (page-level)**: rewire `/me/sessions/[id]/edit` and the nudge page to real tRPC data (content/sending follow later).

### Phase 2 — Wholeness (links & dead-ends)
- **M1**: kill stale `spr-northwind-q2` links (derive sprint id in sidebar; fix marketing).
- **M2**: Twistag client drill-in (twistag-scoped readers) + honest cockpit nav.
- **M3 / M4 / L1**: sponsor journey definition; `/admin` org drill-in; sponsor-attribution fix.

### Phase 3 — Then build outward (the deferred integrations)
Only after Phases 0–2 are green:
- **LLM slice:** real conversation + capture extraction (`services/conversation` + `services/llm`) → real captures feed the edit window (H4) and evidence.
- **Email/Inngest:** invitation emails on launch (ATL-204/205) + nudge sending (H3) via Resend.
- **External integrations / SOW doc generation / pull-capability** per roadmap v2.

---

## Test-route reference (for re-runs)
- Seeded Northwind sprint id: `5f1b2c00-0000-4000-8000-000000000001`
- Personas via `/sign-in/dev`: `admin@twistag.com` (twistag), `marcus@northwind.example` (mgr), `dana@northwind.example` (sponsor), `priya@northwind.example` (IC, has completed sessions), `jordan@helios.example` (mgr, fresh tenant), `sam@helios.example` (IC).
- Landing pages today: twistag→`/admin`, manager/sponsor→`/team`, IC→`/me`.
