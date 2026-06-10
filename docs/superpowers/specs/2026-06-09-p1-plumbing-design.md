# P1 Plumbing — auth gating + approve/SOW + page rewires — design spec

**Date:** 2026-06-09
**Status:** Approved (design)
**Owner:** fred@twistag.com
**Source:** `docs/superpowers/assessments/2026-06-09-journey-audit.md` (Phase 1).
**Builds on:** lifecycle slice + P0 connection-pooling fix (both on main).
**Decisions:** approve authority = **manager + sponsor** (existing `managerProcedure`);
SOW UX = **persist auto-generated draft read-only** (editable drawer + LLM generation
deferred to ATL-501/502); scope = **all four** items (H1–H4).

---

## 1. Goal

Close the Phase-1 plumbing gaps from the journey audit, with no external
dependencies (no LLM, email, or integrations):
- **H1** — consistent auth/role gating (stop 500s for non-tenant sessions; stop
  ICs loading manager-only views).
- **H2** — persist the approve → SOW → FDE transition (real `sow_drafts` +
  `status='approved'`; cockpit "approved" count becomes real).
- **H3** — rewire the nudge page onto real participant data (stop the 404).
- **H4** — rewire the capture-edit page onto real session/captures (stop the 404).

## 2. Data model — migration `db/migrations/0004_sow_and_approval.sql`

**New table `sow_drafts`** (tenant-scoped, adapted to current conventions —
`price_usd` integer like the existing `SowDraft` type, not the arch's cents):

```sql
CREATE TABLE public.sow_drafts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id),
  opportunity_id  uuid NOT NULL REFERENCES public.opportunities(id),
  sprint_id       uuid NOT NULL REFERENCES public.sprints(id),
  title           text NOT NULL,
  scope           text NOT NULL,
  inclusions      text[] NOT NULL DEFAULT '{}',
  exclusions      text[] NOT NULL DEFAULT '{}',
  team            jsonb NOT NULL,
  duration_weeks  integer NOT NULL,
  price_usd       integer NOT NULL,
  success_metrics text[] NOT NULL DEFAULT '{}',
  status          text NOT NULL DEFAULT 'draft',
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

**Add to `opportunities`:** `approved_at timestamptz`, `approved_by uuid REFERENCES public.users(id)`.

**RLS (per ADR-001):** standard 4 tenant policies on `sow_drafts`
(`tenant_select/insert/update/delete` using `tenant_id = auth.jwt()->>'tenant_id'`)
+ `sow_drafts_twistag_read` (`USING twistag_role IS NOT NULL`) so the cockpit/Twistag
can read approved SOWs. Grants `SELECT,INSERT,UPDATE,DELETE` to `authenticated`,
`ALL` to `service_role`. Index `sow_drafts_tenant_idx`.

**Drizzle schema (`db/schema.ts`):** add `sowDrafts` pgTable; add `approvedAt`,
`approvedBy` to `opportunities`.

> ⚠️ **Process:** this migration adds a new RLS table → per CLAUDE.md the PR needs
> **2 engineer approvals**, and the new table requires an **adversarial cross-tenant
> test** (included in §6). Flag at merge.

## 3. H1 — Auth gating

**New `lib/auth-guards.ts`** (server-only):
- `requireTenantSession()`: `getSession()`; no session → `redirect('/sign-in')`;
  `kind !== 'tenant'` → `redirect('/admin')`; returns the narrowed tenant claims.
- `requireManagerOrSponsor()`: calls `requireTenantSession()`; if role not
  `manager`/`sponsor` → `redirect('/me')`; returns claims.

**Apply (top of each page):**
- `/me` → `requireTenantSession()` (twistag/non-tenant redirected, no 500).
- `/sprint/[id]`, `/sprint/[id]/report`, `/sprint/[id]/opportunity/[oppId]`,
  `/sprint/[id]/nudge/[participantId]` → `requireManagerOrSponsor()`.

Procedures stay `tenantProcedure`; gating is page-level (matches `/sprint`, `/team`).

## 4. H2 — Persist approve → SOW

- **`lib/sow.ts`** `buildSowDraft(opp: Opportunity, tenantName: string): SowDraft`
  — server-safe port of `lib/data.ts` `sowDraftFor` (no mock-sprint dependency;
  derives scope/price/metrics from the opportunity).
- **`opportunity.approve`** (`managerProcedure`, mutation, `withTenantContext`):
  1. load the opportunity (RLS-scoped) + its tenant name; `NOT_FOUND` if missing.
  2. if already `approved`, return current state (idempotent).
  3. `buildSowDraft` → insert `sow_drafts`.
  4. update `opportunities` set `status='approved'`, `approved_at=now()`,
     `approved_by=session.userId`.
  Returns `{ status, sowDraft }`.
- **Server action `approveOpportunity(oppId)`** (`app/(app)/sprint/[id]/opportunity/[oppId]/actions.ts`):
  guards manager/sponsor, calls `getApi().opportunity.approve`, `revalidatePath`.
- **`OpportunityDetail.tsx`**: initialize `approved` from `opp.status === 'approved'`
  (not always-false); the sheet's "Send to Twistag" calls `approveOpportunity(opp.id)`
  then `router.refresh()`. Detail page reads the persisted draft when approved (else
  the generated one) for display.
- `opportunity.get` already returns `status`; cockpit `twistag.clientList` "approved"
  count already reads `status='approved'` → becomes real.

## 5. H3 / H4 — Rewire mock pages

- **H3 `sprint.participant({ sprintId, userId })`** (`managerProcedure`): returns
  `{ name, title, status, sessionsCompleted, sessionsTotal }` for one participant
  (RLS-scoped; `NOT_FOUND` if not in the sprint). Rewire
  `nudge/[participantId]/page.tsx` off `lib/data`. **Nudge sending stays deferred**
  (email phase) — `NudgeComposer` renders; its send is a no-op/TODO.
- **H4 `session.captures({ sessionId })`** (`tenantProcedure`, owner-scoped:
  `sessions.user_id = session.userId`): returns `Capture[]` (empty until the LLM
  slice). Rewire `/me/sessions/[id]/edit` to real `session.get` + `session.captures`
  with an empty state — stops the 404. Capture **edit/remove persistence deferred**
  until captures exist.

## 6. Testing

- **Integration (embedded-pg):**
  - `opportunity.approve`: manager approves → `sow_drafts` row + opportunity
    `status='approved'`/`approved_by` set; idempotent on re-approve; an IC session is
    rejected; tenant B cannot approve tenant A's opportunity.
  - **Adversarial `sow_drafts`:** a second tenant reads another tenant's `sow_drafts`
    → 0 rows (mandatory new-table test).
  - `sprint.participant`: returns the participant; IC rejected; cross-tenant → NOT_FOUND.
  - `session.captures`: owner reads own session's captures; another user in the same
    tenant cannot read them (user_id scope).
- **Unit:** `buildSowDraft` shape/derivation.
- **Browser:** twistag→`/me` redirects (no 500); IC→`/sprint/[id]` redirects to `/me`;
  approve persists across reload + cockpit "approved" reflects it; nudge + edit pages
  render real data.
- Existing 33 unit + 45 integration stay green; lint/build green.

## 7. Out of scope / next

LLM SOW generation (ATL-502) + editable SOW drawer (ATL-501 polish); nudge sending +
invitation emails (Inngest/Resend); capture edit/remove persistence + real capture
extraction (LLM slice); Twistag cockpit drill-in (P2-M2); stale-link cleanup (P2-M1).
