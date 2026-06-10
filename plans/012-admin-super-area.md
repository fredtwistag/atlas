# Twistag Admin Super-Area — Full Visibility, Control & Observability

Written against commit `e323025` (main). If files have drifted, re-verify line refs before editing.

## Context

The Twistag admin role (used by Twistag CEO/COO/VP Eng/Head of AI) is nearly blind today. A twistag user gets:
- `/admin`: flat org list + invite-org form. No tenant detail, no edit, no drill-down.
- `/twistag`: cockpit with one tRPC procedure (`twistag.clientList`) — per-tenant summary of the *active* sprint only. Client rows are not clickable.
- **Nothing else.** No company detail/edit, no per-company sprint list, no company users view, no report access (tenant routes redirect twistag users away), no audit log UI.

Sidebar is broken for this role: persona is chosen by **path**, not role (`components/AppSidebar.tsx:145-150`), and no persona matches `/admin` — so on `/admin` a twistag admin sees the **IC nav**. The Twistag persona has one live item ("All clients") + 5 "Soon" placeholders.

Goal: one coherent admin area with full cross-tenant visibility (companies, sprints, users, reports, SOWs), ops-level control, and an audit log viewer — all audited.

## Decisions (confirmed by Fred)

1. **Consolidate under `/admin` — the home for ALL Twistag roles.** Landing already sends twistag → `/admin` (`lib/landing.ts`) — unchanged. `/admin` becomes the cockpit (client list, currently at `/twistag`). Company drill-down at `/admin/clients/[tenantId]` (tabs: Overview, Sprints, People, Opportunities & SOWs, Activity). Org-invite moves to `/admin/clients/new`. Audit viewer at `/admin/audit`. `/twistag` becomes a redirect to `/admin`.
2. **One flat admin tier — every Twistag staff member has identical, full permissions.** The only gate is `kind === "twistag"`, which the existing `twistagProcedure` (tRPC) and `requireTwistagSession` (pages) already enforce. NO `twistagAdminProcedure`, NO `requireTwistagAdmin`, no per-role conditionals anywhere in the UI. The `twistag_role` DB column / JWT claim stays untouched (no migration) but becomes an informational label recorded in audit metadata — never used for authorization. (Internal tRPC router stays named `twistag.*` — routes are user-facing, router names aren't.)
3. **Control scope = ops, not client decisions:** edit company (name/segment/status), manage company members (invite/resend/cancel/change role/remove), close sprints. **NOT** approving opportunities or editing SOWs — approval stays a client (sponsor/manager) signal.
4. **No RLS policy changes, no migrations.** Reads via `withTwistagContext` (existing `*_twistag_read` policies cover all tenant tables incl. `tenants` via migration 0003). Writes via `withServiceRole` audited server actions (matches existing `inviteOrganization` pattern). Avoids the 2-approval RLS PR rule.

## Verified current-state facts (vetted by direct reads)

- Roles: `twistag_users` table (`twistag_admin|twistag_lead|twistag_account_manager`); JWT claim `twistag_role` minted by `custom_access_token_hook` (`db/migrations/0001_auth_onboarding.sql:47-83`). Guards: `lib/auth-guards.ts` (`requireTwistagSession:31`). Landing: `lib/landing.ts` (twistag → `/admin` — already correct).
- tRPC guards `server/trpc/trpc.ts`: `tenantProcedure`, `managerProcedure`, `twistagProcedure` (no twistag-role differentiation).
- `db/client.ts`: `withTenantContext:63`, `withServiceRole:85` (audits only `action` + `metadata.actor` — `tenant_id/user_id/target_id` columns left NULL), `withTwistagContext:109` (audits `twistag.read` then reads as `authenticated` + `twistag_role` claim; **read-only by RLS design**).
- `audit_log` columns already exist (`db/schema.ts:29-37`); `sprint.nudge` (`server/trpc/routers/sprint.ts:170-176`) already writes full-column rows → enrichment is signature-widening, **no migration**.
- `tenants` HAS RLS (`db/migrations/0003_tenants_self_read.sql`): self-select + twistag_read, SELECT-only. `audit_log` + `twistag_users` have no authenticated grant → **audit viewer must read via `withServiceRole`**.
- `/admin` already referenced (and stays valid): `lib/landing.ts`, `lib/landing.test.ts`, `lib/auth-guards.ts:15`, `app/(app)/team/page.tsx:28`, `app/(app)/sprint/page.tsx:20`. No changes needed to these redirects.
- Cockpit bugs: NaN when 0 tenants (`app/(app)/twistag/page.tsx:26-28`); `engagementLead: "You"` hardcoded and render-dead (`server/trpc/routers/twistag.ts:74`, `lib/types.ts`, 4 spots in `lib/data.ts`).
- `components/opportunity/OpportunityCard.tsx:22` unconditionally wraps in `<Link href>` — needs optional href for read-only report.
- Report page (`app/(app)/sprint/[id]/report/page.tsx`): derived values :31-35, toolbar :38-57 (page-specific), `<article>` :59-196 (extractable), local `Section`/`RoadmapColumn` helpers :201-247. Exec summary :103-106 contains hardcoded demo copy — leave as-is (pre-existing).
- Seed (`db/seed-demo.ts`) has only one twistag user (`admin@twistag.com`, twistag_admin).
- UI kit to reuse: `components/ui/` (PageContainer, StatCard, Table+StatusCell, Card, Badge + `lib/ui-maps.ts` tones, ProgressBar, Skeleton, ConfirmDialog, Sheet, Button/ButtonLink — 44px = `h-[44px]`, root font 14px), responsive list pattern `components/manager/TeamProgress.tsx`, canonical tablist `components/opportunity/OpportunityDetail.tsx:156-201`, `MemberRow`/`PendingInviteRow` take action props (reusable as-is).
- Tests: `npm run test` (unit), `npm run test:integration` (embedded-postgres :5433; helpers `db/test/helpers.ts`), `npm run test:e2e` (Playwright, signs in via `/sign-in/dev` persona buttons), `npm run verify` (full gate). Patterns: page-contract `server/trpc/pages.integration.test.ts`, adversarial RLS `db/sprints.integration.test.ts`, twistag context `db/twistag-context.integration.test.ts`. GOTCHA: don't run `build` while `next dev` runs.
- Privacy rule: IC quotes never shown with IC name (role only) — admin surface must expose **no captures/quotes** (`clientDetail`/`sprintView` below don't; `opportunity.listForSprint` carries no evidence).

---

## Phase 0 — Cockpit fixes (tiny, ships alone)

- `app/(app)/twistag/page.tsx` (moves to `/admin` in Phase 1 — fix here first or fold into the move): zero-guard `avgCompletion` (`clients.length ? ... : 0`); add house-style empty state (dashed-border card: what would be here + how to get there) when no clients.
- Delete `engagementLead` from `lib/types.ts` (ClientSummary), `server/trpc/routers/twistag.ts:74`, 4 literals in `lib/data.ts`.
- Tests: extend `server/trpc/router.integration.test.ts` clientList block (no `engagementLead`; empty-tenant shape).

## Phase 1 — Route consolidation under /admin + role-aware sidebar

- **Move the cockpit:** content of `app/(app)/twistag/page.tsx` → `app/(app)/admin/page.tsx` (replacing the org-list page; keep `requireTwistagSession` guard, PageContainer, force-dynamic). Gut `app/(app)/twistag/page.tsx` to `redirect("/admin")` (keeps old links alive).
- **Move org-invite:** current org list + invite form from old `app/(app)/admin/page.tsx` + `actions.ts` → new `app/(app)/admin/clients/new/page.tsx` + `actions.ts` (guard stays `requireTwistagSession`; redirect/revalidate paths `/admin` → `/admin/clients/new`). Note: the org *list* on that page is redundant once `/admin` is the cockpit — keep just the invite form + success/error searchParam banners.
- `lib/auth-guards.ts`: NO changes needed. Existing redirects to `/admin` (`requireTenantSession:15`, `team/page.tsx:28`, `sprint/page.tsx:20`) and `lib/landing.ts` stay as-is — they now point at the cockpit.
- Sidebar role-awareness (minimal API): `app/(app)/layout.tsx` passes `userKind={me.kind}` → `components/AppShell.tsx` forwards → `components/AppSidebar.tsx` `activePersona(personas, pathname, userKind)`: twistag kind **always** gets the Twistag persona; tenant kinds keep path-based selection. Twistag persona: `home: "/admin"`, `match: ["/admin", "/twistag"]`; items: "All clients" → `/admin` (`match: ["/admin", "/admin/clients"]` — matchScore prefers most-specific), "New client" → `/admin/clients/new`; keep honest `soon` placeholders. Export persona helpers for unit testing.
- Tests: persona unit test (twistag kind on any path → Twistag persona; tenant manager on /team → Manager persona); e2e: dev sign-in as `admin@twistag.com` → lands `/admin`, sidebar shows "All clients"; `/twistag` redirects to `/admin`.

## Phase 2 — Data layer: audit enrichment, shared reads, twistag procedures

- `db/client.ts`: widen `withServiceRole` audit param to `{ action, actor, tenantId?, userId?, targetId?, metadata? }` (optional fields → compile-compatible with all 11 call sites); fill `tenant_id/user_id/target_id` columns, merge metadata with `{actor}`. **Do NOT auto-derive user_id from actor** (existing actors include "test"/"dev"/"seed"). Same optional `{tenantId?, targetId?}` on `withTwistagContext`.
- New `lib/sprint-read.ts` (tx-level pure functions, `lib/members.ts` convention): `loadSprint(tx,id)`, `loadSprintProgress(tx,id)`, `listSprintOpportunities(tx,sprintId)` — lifted from `sprint.get` (`server/trpc/routers/sprint.ts:349-463`), `sprint.progress`, `opportunity.listForSprint`. Refactor those routers to call them (pure refactor; existing suites are the regression net).
- `server/trpc/trpc.ts`: NO changes — the existing `twistagProcedure` is the only guard needed (all twistag staff have equal permissions).
- Extend `server/trpc/routers/twistag.ts` (Zod every input; **one aggregate procedure per page** to limit `twistag.read` audit noise):
  - `twistag.clientDetail({tenantId})` → one `withTwistagContext({..., tenantId})`: `{ tenant, members, pendingInvitations, sprints: [{id,name,status,dates,completionPct,participantCount,opportunityCount,approvedCount,sowDraftStatuses}] }`. NOT_FOUND if missing. No captures.
  - `twistag.sprintView({sprintId})` → `{ sprint, progress, opportunities }` via the `lib/sprint-read.ts` functions (powers read-only report).
  - `twistag.auditLog({tenantId?, action?, includeReads=false, from?, to?, cursor?, limit≤100})` → via `withServiceRole({action:"twistag.audit.view", ...})` (authenticated has no audit_log grant); `{rows, nextCursor}` by `id desc`; `includeReads:false` hides `twistag.read`.
  - `twistag.sprintClose({sprintId})` — `twistagProcedure` mutation; select-first (NOT_FOUND), update with explicit `eq(id) AND eq(tenantId)`; audit `twistag.sprint.close` with tenantId+targetId.
- New `lib/twistag-admin.ts` (server-only, Next-free, integration-testable): `TwistagActor = { userId: string; twistagRole: string }` (carried for audit attribution only — NO role checks); `updateTenant`, `inviteMemberToTenant`, `updateMemberRoleInTenant`, `removeMemberFromTenant` (refactor: extract service-role body of `removeMemberRecord` in `lib/members.ts` into shared internal; keep last-manager guard; skip self-removal check), `cancelInvitationInTenant`, `getPendingInvitationInTenant`. Every statement explicitly tenant-scoped. Audit actions: `twistag.tenant.update`, `twistag.member.invite|role|remove`, etc., with tenantId/targetId filled and `twistag_role` in metadata.
- Tests (integration):
  - New `db/audit-enrichment.integration.test.ts`: full-field rows write columns; legacy 2-field calls still work; `withTwistagContext` tenantId lands in row.
  - Extend `server/trpc/router.integration.test.ts`: every `twistag.*` (reads AND mutations) rejects tenant sessions — the adversarial boundary is twistag-vs-tenant, not twistag-role-vs-role; any twistag session (admin OR lead — both shapes tested) can call `sprintClose` and it flips status + writes the audit row; `clientDetail` NOT_FOUND + cross-tenant aggregation; `auditLog` pagination/filters/includeReads + self-audit row.
  - New `lib/twistag-admin.integration.test.ts` (mirror `lib/members.integration.test.ts`): tenant A mutations leave tenant B untouched (explicit-scoping adversarial); last-manager guard; audit rows carry tenantId/targetId/twistag_role.

## Phase 3 — Client drill-down UI + member management + read-only report

- New `app/(app)/admin/clients/[tenantId]/page.tsx`: `requireTwistagSession()` + `api.twistag.clientDetail`; header (name, segment/status Badges, BackLink → `/admin`); canonical roving-tabindex tablist (pattern: `OpportunityDetail.tsx:156-201`) in small client component, content server-rendered:
  - **Overview**: StatCards + company-edit form (every twistag user — no role conditionals).
  - **Sprints**: ALL sprints, Table desktop / stacked cards mobile (TeamProgress pattern), status badges, ProgressBar, link to report, "Close sprint" (ConfirmDialog).
  - **People**: reuse `MemberRow`/`PendingInviteRow` with twistag actions, `canManage={true}`, `isSelf={false}`; invite form.
  - **Opportunities & SOWs**: read-only list (title, score, status, SOW draft status). No approve buttons.
  - **Activity**: last ~20 `twistag.auditLog` rows for tenant (`includeReads:false`) + link to full log.
- New `app/(app)/admin/clients/[tenantId]/actions.ts`: `"use server"` wrappers (updateTenant, inviteMember [+ Supabase createUser + invite email, copy team/actions.ts], updateMemberRole, removeMember, resendInvite, cancelInvite, closeSprint). Each: session check → `lib/twistag-admin.ts` core → `revalidatePath` → searchParam banners.
- **Report extraction** → new `components/report/ReportArticle.tsx`: move `<article>` (report page :59-196) + module-private `Section`/`RoadmapColumn` (:201-247) + derived values (:31-35). Props `{ sprint, progress, opps, opportunityHref?: (id) => string }`. Toolbar + guard + fetch stay per-page.
  - Slim `app/(app)/sprint/[id]/report/page.tsx` to guard + fetch + toolbar + `<ReportArticle opportunityHref={...} />`.
  - New `app/(app)/admin/clients/[tenantId]/sprint/[sprintId]/report/page.tsx`: `requireTwistagSession()`, `twistag.sprintView`, **verify sprint.tenantId === route tenantId else notFound()**; toolbar: BackLink → client detail, "Twistag view · read-only" label, PrintButton; `opportunityHref={undefined}`.
  - **Escape hatch:** if extraction gets entangled, duplicate the article as a read-only copy under the admin route and leave the manager page untouched (accept copy drift); report back.
- `components/opportunity/OpportunityCard.tsx`: `href?` optional — plain Card without Link/arrow when absent.
- `app/(app)/admin/page.tsx` (cockpit): client name cells → `Link` to `/admin/clients/{tenantId}`; alert rows link too.
- `lib/ui-maps.ts`: add `tenantStatusMeta` (active/onboarding/paused/churned tones).
- Tests: page-contract for `clientDetail`/`sprintView` (exact render contract); unit OpportunityCard-without-href; e2e: cockpit → click client → tablist + ArrowRight keyboard nav → open report → "read-only" label visible.

## Phase 4 — Audit log viewer

- New `app/(app)/admin/audit/page.tsx`: `requireTwistagSession()`; GET-form filters via searchParams (tenant select from clientList, action prefix, actor, dates, includeReads checkbox default off); Table (At, Action badge, Tenant name, Actor, Target, metadata summary); "Older →" cursor link; house-style empty state ("No audit entries match. Every Twistag cross-tenant read and admin change lands here automatically.").
- `components/AppSidebar.tsx`: Twistag persona gains "Audit log" (`/admin/audit`) under a "Governance" group.
- Tests: one combined-filters page-contract case; e2e optional.

## Phase 5 — Polish + full gate

- Final pass: empty states on every new page, loading.tsx skeletons for client detail + audit (compose `components/ui/Skeleton.tsx` like `app/(app)/loading.tsx`), copy review per style guide.
- Also sync the repo copy of this plan (`plans/012-admin-super-area.md`) and its README row if drifted.

## Verification (per phase + final)

```
npm run verify            # typecheck + lint + format + unit + integration
npm run test:integration  # embedded-postgres RLS/adversarial suites
npm run test:e2e          # Playwright (needs seeded Supabase dev + `npm run dev`)
```
Manual: `/sign-in/dev` → admin@twistag.com → land `/admin` (cockpit) → click client → all 5 tabs → edit company → People invite/resend/cancel → close a sprint → open report → `/admin/audit` shows the full trail of those actions. `/twistag` redirects to `/admin`.

## Risks / notes

- **Stale JWT after offboarding**: claims are minted at token time, so removing someone from `twistag_users` doesn't revoke their existing JWT until refresh. Acceptable v1; note in PR. (No role-demotion risk — there's only one permission tier.)
- **Audit noise**: each `withTwistagContext` call = one `twistag.read` row; mitigated by aggregate-procedure-per-page + viewer default-off toggle. Never stop logging.
- **Supabase deps**: invites need `SUPABASE_SERVICE_ROLE_KEY` + access-token hook enabled in dashboard (already true for /admin and /team).
- **No RLS edits** → 2-approval PR rule not triggered. If a reviewer wants `tenants` write policies instead of service-role writes, push back: mirrors existing `inviteOrganization`/`removeMemberRecord` pattern deliberately.
- Copy style throughout: short, honest, no corporate-speak; errors say what happened + what to do.

---

## Implementation notes (executed — branch `feat/admin-super-area`)

Built phase by phase; each phase gated by typecheck + lint + unit + integration, and the admin surface browser-verified (cockpit, drill-down tabs, read-only report, audit viewer). Deviations from the spec above, all deliberate:

1. **`twistag.clientDetail` returns an extra `opportunities[]`** (`{id, sprintId, title, compositeScore, status, sowStatus}`) — the "Opportunities & SOWs" tab needs titles/scores, not just the per-sprint counts. Still privacy-safe (no evidence/quotes). One read per page preserved.
2. **Drill-down mutations use inline-feedback client components** (`CompanyEditForm`, `InviteMemberForm`, `CloseSprintButton` + `MemberRow`/`PendingInviteRow` via `useTransition`) instead of searchParam banners, so the active tab survives a mutation. Actions don't redirect; they `revalidatePath`. The org-invite at `/admin/clients/new` keeps its searchParam banners (single-purpose page).
3. **`sprintClose` is two-step**: a `withTwistagContext` read resolves the sprint's tenant (NOT_FOUND if missing), then an audited `withServiceRole` update closes it with `tenantId`+`targetId`. Necessary because `withServiceRole` writes its audit row *before* `fn` runs, so the tenant must be known up front.
4. **Strict `z.uuid()` on `clientDetail`/`auditLog` tenantId**: the `TENANT_A/B` test fixtures aren't valid *versioned* UUIDs, so tenant-filtered tests seed fresh valid-UUID tenants. Production tenant ids (`defaultRandom()`) are valid v4.
5. **`tablist` UX**: panels stay mounted (`hidden`) so form/input state survives tab switches; roving tabindex + Arrow/Home/End nav per the OpportunityDetail pattern.
