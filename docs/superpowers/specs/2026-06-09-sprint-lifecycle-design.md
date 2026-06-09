# Sprint lifecycle + finish dashboard rewiring — design spec

**Date:** 2026-06-09
**Status:** Approved (design)
**Owner:** fred@twistag.com
**Builds on:** DB+RLS, Supabase Auth + onboarding, tRPC real-data (all on main).
**Decisions:** manager launches a sprint via a simple one-page form; finishing a
(scripted) session marks the session complete (no captures yet); Twistag cockpit
reads cross-tenant via a new `withTwistagContext()` (RLS `*_twistag_read` policies).

---

## 1. Goal

Close the loop and finish the rewiring:
- **A.** A manager **launches a sprint** for invited members → creates topics,
  participants, and sessions (one per participant × topic).
- **B.** Invited ICs sign in and **`/me`** shows their real sessions; finishing a
  session marks it complete and advances progress.
- **C.** The **final report** reads real sprint + opportunities.
- **D.** The **Twistag cockpit** reads real cross-tenant client health.

After this, only the conversation's *capture extraction* remains mock (the LLM slice).

## 2. Phase A — Sprint creation + sessions

**UI:** `/sprint` (manager). If the tenant has an active sprint → redirect to it
(today's behavior). If not → a **launch form**: name, primary focus, a checklist of
the 4 default topic templates (pre-checked), and checkboxes of the tenant's members
(ICs + sponsor pre-checked). One "Launch sprint" button.

**Topic templates** (constant `lib/topic-templates.ts`): the 4 from the demo — How
work flows / When things break / Tools & systems / One change — each with
description, question_count, est_minutes.

**Mutation** `sprint.launch` (tRPC `managerProcedure` — tenant session with role
manager/sponsor), inside `withTenantContext`:
1. insert `sprints` (status `active`, start = today, end = +24d, cadence weekly,
   manager_id = session.userId, primary_focus, scope from members' departments).
2. insert selected `topics`.
3. insert `sprint_participants` for selected members (status `not_started`,
   sessions_total = #topics).
4. insert `sessions` (participant × topic, status `not_started`).
All inserts carry the session's tenant_id → RLS insert policies permit them; a manager
cannot launch into another tenant (RLS `WITH CHECK`).

**Input** `LaunchSprintSchema` (Zod): `{ name, primaryFocus, topicKeys: string[],
participantIds: uuid[] }`.

## 3. Phase B — `/me` on real data + complete

**Read** `session.myDashboard()` (tRPC `tenantProcedure`, any tenant role): find the
user's active sprint via `sprint_participants` where `user_id = session.userId`;
return `{ sprintName, sessions: SessionView[] }` (sessions joined to topics, with
status/completedAt/editWindowEndsAt/estMinutes/title). Empty state if not a participant.

**Rewire** `app/(app)/me/page.tsx` from `db.session.mine()`/`db.sprint.get()` to
`api.session.myDashboard()`. Same rendering (progress pills, next-session CTA,
completed list). Session links go to `/session/<real-session-uuid>`.

**Complete** — a server action `completeSession(sessionId)` (`app/(app)/session/actions.ts`):
verifies the session belongs to the signed-in user (RLS + user_id check), sets
`status='completed'`, `completed_at=now()`, `edit_window_ends_at=now()+7d`, and bumps
the participant's `sessions_completed`. Wired into `ConversationView`'s "done" state
(client → server action). The conversation content stays scripted; **no captures
written** (LLM slice). `session.get` (tenant-scoped) replaces the demo title lookup
in `app/(app)/session/[id]/page.tsx`.

## 4. Phase C — Report on real data

**Rewire** `app/(app)/sprint/[id]/report/page.tsx` from `db.*` to the existing
`api.sprint.get` + `api.opportunity.listForSprint` (+ a small `api.sprint.progress`).
Top-5 impact sum and quick-win/high-impact splits computed in the page from the real
opportunities. `notFound()` on a bad/cross-tenant id (RLS).

## 5. Phase D — Twistag cockpit on real data

**`withTwistagContext(fn)`** (new, `db/client.ts`): transaction, `SET LOCAL ROLE
authenticated`, `set_config('request.jwt.claims', '{"twistag_role":"…"}')` (no
tenant_id). The `*_twistag_read` RLS policies (`USING twistag_role IS NOT NULL`) then
grant cross-tenant SELECT on `tenants`/`sprints`/`opportunities`/etc. — proper RLS, not
a service-role bypass. Audit-logged via an explicit `audit_log` write in the helper.

**`twistagProcedure`** (trpc.ts): requires `session.kind === 'twistag'`.

**`twistag.clientList()`**: inside `withTwistagContext`, read all tenants + aggregate
per tenant (active sprint name, completion %, opportunity count, approved count,
a derived health + alert). Returns `ClientSummary[]` (the shape the page renders).

**Rewire** `app/(app)/twistag/page.tsx` from `db.twistag.clientList()` to
`api.twistag.clientList()`.

## 6. Seed update

`db/seed-dashboard.ts` also inserts **sessions** for Northwind participants (per
participant × topic; statuses derived from each participant's `sessions_completed`),
so existing Northwind ICs' `/me` is real. Idempotent (cleared with the other rows).

## 7. tRPC surface added

- `sprint.launch` (managerProcedure, mutation)
- `session.myDashboard` (tenantProcedure), `session.get` (tenantProcedure)
- `twistag.clientList` (twistagProcedure)
- Server action `completeSession` (not tRPC — called from a client component).

## 8. Testing

- **Integration (embedded-pg):**
  - `sprint.launch` under tenant A creates sprint+topics+participants+sessions; a
    second tenant's session cannot create rows tagged tenant A (RLS).
  - `session.complete` (via the action's core) flips status + bumps progress; a user
    cannot complete another user's session.
  - `withTwistagContext`: a twistag context reads ≥2 tenants' sprints; a tenant context
    reads only its own (control). `twistagProcedure` rejects a tenant session.
- **Unit:** `LaunchSprintSchema` validation; topic-template constants; any progress math.
- Existing 28 unit + 32 integration stay green; lint/build green.

## 9. Risks

- **Manager inserting rows for other users** — allowed by RLS (tenant-scoped insert);
  the managerProcedure gate + tenant scoping bound it. Tested.
- **`withTwistagContext` leaking writes** — read-only use in the cockpit; the helper is
  used only for SELECTs here. (Twistag impersonation-write remains out of scope.)
- **One-active-sprint assumption** — `/sprint` redirects to the most recent; launching a
  second isn't offered in the form (YAGNI). Flagged.
- **Session id in the conversation** — `/session/[id]` now expects a real session UUID;
  `session.get` validates ownership; the scripted script is the same regardless.

## 10. Success criteria

- A manager with no sprint sees the launch form, launches → redirected to the real
  dashboard; the invited members appear with `not_started` sessions.
- An invited IC signs in → `/me` shows real sessions; finishing one marks it complete
  and the manager dashboard/`/me` progress reflect it.
- The report renders real opportunities; the Twistag cockpit renders real multi-tenant
  health (and a tenant user can't call it).
- Full gate green; cross-tenant blocked (adversarial + router/twistag isolation tests).

## 11. Out of scope / next

Real capture extraction (LLM slice), sprint editing/closing, nudge emails (Resend),
Twistag impersonation-write, the full 5-step wizard, weekly digests (Inngest).
