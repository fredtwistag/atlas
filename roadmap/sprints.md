# Sprint Backlog — 10 sprints × 2 weeks each (20 weeks total)

> Includes pre-build workshop. Ticket format: `ATL-<n>`.
> Each ticket: title · acceptance criteria · references · DoD.

---

## Sprint 00 (week 0) — Pre-build foundations

**Goal:** Ground truth, decisions, pilot LOIs. No code yet.

### ATL-000 · Ground truth workshop
- **AC:** 1-2 day workshop with 5-8 Twistag people role-playing discovery sessions. 5-10 sessions recorded + transcribed via Whisper. Senior Twistag manually scores expected captures per transcript.
- **Refs:** `docs/05-pilot-playbook.md` (ground truth section), `prompts/discovery-rubric.md`
- **DoD:** 10 transcripts + 10 ground-truth capture sets stored in `evals/ground-truth/`; CI eval harness reads from there.

### ATL-001 · Open decisions resolved
- **AC:** Naming locked. 3 pilot customers verbally confirmed. Product lead hired. Funding decision. SOC2 vendor picked. Hosting region locked.
- **DoD:** Each decision logged in `docs/01-vision-and-prd.md` §10.

---

## Sprint 01 (weeks 1-2) — Foundation

**Goal:** Repo, infra, auth, RLS scaffolding working.

### ATL-010 · Scaffold Next.js 15 monorepo
- **AC:** `pnpm dev` runs locally; TS strict; Tailwind + tokens loaded; CI passes lint + typecheck.
- **Refs:** `design/tailwind.config.js`, `design/tokens.css`
- **DoD:** Vercel preview deployed from main.

### ATL-011 · Provision Supabase project (EU region)
- **AC:** Supabase project created; pgvector extension enabled; service-role + anon keys in env; Drizzle config wires to dev DB.
- **Refs:** `docs/02-architecture.md` §3
- **DoD:** `pnpm db:push` runs cleanly.

### ATL-012 · Stytch magic link auth
- **AC:** `/sign-in` route requests magic link; verify endpoint validates token; JWT cookie set on success (contains `tenant_id`, `user_id`, `role`).
- **Refs:** `docs/02-architecture.md` §5.1
- **DoD:** Demo: enter email, receive link, click → land on `/me` authenticated.

### ATL-013 · RLS scaffolding + adversarial test harness
- **AC:** Helper `withTenantContext(jwt, fn)` for tests; `expectIsolated(table)` asserts cross-tenant queries return zero. Pattern documented in `docs/adrs/001-rls-multi-tenant.md`.
- **Refs:** `docs/adrs/001-rls-multi-tenant.md`, `claude/coding-standards.md`
- **DoD:** Test harness exercised on `tenants` + `users` tables; CI runs on every PR.

### ATL-014 · Tenants registry + RLS-enabled `users` + `sprints`
- **AC:** Migration creates `public.tenants` (no RLS), `public.users` and `public.sprints` (RLS enabled with standard policies). Service-role bypass for Twistag-admin.
- **Refs:** `docs/02-architecture.md` §4.1
- **DoD:** Adversarial tests pass on `users` and `sprints`; manual cross-tenant attempt returns 0 rows.

### ATL-015 · Audit log middleware
- **AC:** Every tRPC mutation writes to `public.audit_log` via service-role insert; reads do not write.
- **Refs:** `docs/02-architecture.md` §2.2
- **DoD:** Twistag-admin endpoint shows recent entries.

### ATL-016 · tRPC + Zod scaffold
- **AC:** Working tRPC server in `apps/web/server/`; first router `auth` implemented; client provider wraps app.
- **Refs:** `docs/02-architecture.md` §5
- **DoD:** Calling `trpc.auth.session.current()` from a client component returns user info.

### ATL-017 · ADR-001 + CLAUDE.md updates
- **AC:** ADR-001 committed (already drafted). CLAUDE.md aligned to current state. First weekly ADR review scheduled.
- **DoD:** ADR-001 merged; CLAUDE.md reflects RLS pattern.

### ATL-018 · Base UI components — Tier 1 starter set
- **AC:** `Button`, `Input`, `Card`, `Avatar`, `Badge`, `ProgressBar` working with all variants from design system.
- **Refs:** `docs/04-design-system.md` §4
- **DoD:** `/dev/components` page showcasing all variants.

---

## Sprint 02 (weeks 3-4) — First conversation

**Goal:** IC can have a real conversation with the service; captures are extracted and stored.

### ATL-100 · Remaining tenant-scoped tables + RLS
- **AC:** Migration adds `topics`, `sprint_participants`, `sessions`, `messages`, `captures`, `documents`, `opportunities` and related tables. Each has RLS + adversarial tests.
- **Refs:** `docs/02-architecture.md` §4.1
- **DoD:** All adversarial tests pass; Drizzle types regenerated.

### ATL-101 · LLM service abstraction layer
- **AC:** `services/llm/complete<T>()` works with Anthropic provider; writes to `llm_calls` audit; retries on schema failure.
- **Refs:** `docs/02-architecture.md` §2.4, §7
- **DoD:** Unit tests for schema validation + retry + cost tracking.

### ATL-102 · Conversation service — Arc 1 only
- **AC:** `services/conversation/start(sessionId)` returns first message from Arc 1 anchor. `respond(sessionId, userMessage)` handles Arc 1 follow-ups. State machine handles Arc 1 only.
- **Refs:** `prompts/discovery-rubric.md`, `prompts/role-prompts/ic-role-prompts.md`
- **DoD:** Manual test: 3 different IC interactions yield 3 different anchor questions; probes fire appropriately. Eval against ground truth subset.

### ATL-103 · Extraction pass
- **AC:** Every user message triggers an extraction LLM call; results validated against `CaptureSchema`; persisted to `captures` table.
- **Refs:** `docs/03-conversational-engine.md` §6, `prompts/probe-patterns.md`
- **DoD:** Eval against ground truth: precision ≥70% on 5 sample messages.

### ATL-104 · IC session UI v1 — Arc 1 only
- **AC:** Route `/session/[id]` renders chat thread + input + side panel; integrates with tRPC `session.respond`.
- **Refs:** `prototypes/atlas-ic-journey.html` screen 4
- **DoD:** Full session in dev: open URL, send 4 messages, see captures populate side panel.

### ATL-105 · Conversation service — Arcs 2-4
- **AC:** State machine advances through all 4 arcs; respects 2-probe budget per arc; emits `session_complete`.
- **Refs:** `prompts/discovery-rubric.md`
- **DoD:** Sample sessions covering each role complete in <8 minutes wall-clock. Eval: coverage ≥70% across arcs.

### ATL-106 · Session pause + resume
- **AC:** User can navigate away; on return to `/session/[id]`, resumes from last message; conversation state preserved.
- **Refs:** PRD F2.5
- **DoD:** Test: 5 different pause durations (1min, 10min, 1hr, 24hr, 7day) all resume correctly.

### ATL-107 · IC privacy disclosure screen
- **AC:** First visit to `/session/*` shows privacy disclosure; cookie marks acceptance; opt-out granular options available.
- **Refs:** `prototypes/atlas-ic-journey.html` screen 2, PRD F1.5
- **DoD:** Disclosure shown exactly once per user; opt-out persists across sessions.

### ATL-108 · Eval CI gate
- **AC:** CI runs ground-truth eval on every PR that touches `prompts/` or `services/conversation/`. Block merge if coverage drops >3pp.
- **Refs:** `docs/03-conversational-engine.md` §9
- **DoD:** Eval workflow visible in PR checks.

---

## Sprint 03 (weeks 5-6) — Sprint setup + invitations

**Goal:** Manager can create a sprint and invite team via emails.

### ATL-200 · Sprint setup wizard — 5 steps
- **AC:** Routes for each step; state persists in URL; review screen aggregates all inputs.
- **Refs:** `prototypes/atlas-sprint-setup.html`
- **DoD:** Manager can navigate forward/back; refresh doesn't lose progress.

### ATL-201 · Topic templates library (seeded)
- **AC:** 4 default topics seeded per tenant (Quote-to-cash, Exception handling, Tools, One change); manager can add custom.
- **Refs:** PRD F1.4, `prompts/discovery-rubric.md`
- **DoD:** Each template has anchor questions, probe templates, est_minutes.

### ATL-202 · Resend email integration + React Email
- **AC:** Sending emails via Resend works in dev; React Email templates for each email type.
- **Refs:** `docs/02-architecture.md` §2.6
- **DoD:** Sending test email from `Magic Link Invite` template.

### ATL-203 · IC magic link invite email
- **AC:** On sprint launch, each invited IC receives an email with magic link + topic preview + time estimate.
- **Refs:** `prototypes/atlas-ic-journey.html` screen 1
- **DoD:** Sprint launch sends emails to N participants in <60s.

### ATL-204 · Sprint launch flow
- **AC:** `sprint.launch` tRPC procedure: marks sprint active, creates session rows for each participant × topic, queues invitation emails via Inngest.
- **Refs:** PRD F1.4
- **DoD:** End-to-end: create sprint via wizard, click launch, observe DB rows + email queue.

### ATL-205 · Inngest worker setup
- **AC:** Inngest configured in dev + Vercel; first job (`magic.link.send`) runs from event.
- **Refs:** `docs/02-architecture.md` §8
- **DoD:** Job retries 3x on failure; failures logged.

### ATL-206 · Idle reminder cron
- **AC:** Hourly cron checks paused sessions >24h; emails IC; logs to audit.
- **Refs:** `docs/02-architecture.md` §8, PRD F2.5
- **DoD:** Test by manually setting session.paused_at; cron fires reminder; cooldown of 48h enforced.

### ATL-207 · Weekly digest cron (sponsor + manager)
- **AC:** Monday 09:00 client TZ: digest email sent. Includes WAC, completion %, top opportunities.
- **Refs:** `docs/02-architecture.md` §8, PRD F9.1
- **DoD:** Digest rendered correctly across Outlook + Gmail (manual test).

---

## Sprint 04 (weeks 7-8) — Manager dashboard + IC home + edit

**Goal:** Manager has a working dashboard. IC has a personal home + can edit captures.

### ATL-300 · Manager dashboard — stat strip + team table
- **AC:** Route `/sprint/[id]`; shows 4 stats; team progress table with status badges; click row → drill-down (placeholder).
- **Refs:** `prototypes/atlas-manager-dashboard.html`
- **DoD:** Page loads <500ms with 50 team members in dev fixture.

### ATL-301 · Manager dashboard — opportunity list (placeholder)
- **AC:** Right column shows opportunity list with placeholder data until ATL-401 lands.
- **Refs:** `prototypes/atlas-manager-dashboard.html`
- **DoD:** Stub data renders, link to opportunity detail route works.

### ATL-302 · Manager dashboard — activity feed
- **AC:** Live updates via tRPC poll (5s); shows recent session completions + opportunity surfaces.
- **Refs:** `prototypes/atlas-manager-dashboard.html`
- **DoD:** Activity items render with timestamps in relative format.

### ATL-303 · Manager nudge composer
- **AC:** Route `/sprint/[id]/nudge/[participantId]`; LLM-drafts personalized nudge; preview side; channel picker.
- **Refs:** `prototypes/atlas-manager-nudge.html`
- **DoD:** Sending nudge triggers email + logs to audit.

### ATL-304 · IC personal dashboard
- **AC:** Route `/me`; shows sprint progress pills, next session CTA, completed list with edit windows.
- **Refs:** `prototypes/atlas-ic-dashboard.html`
- **DoD:** Renders correctly with 0, 1, 4 completed sessions.

### ATL-305 · IC edit capture flow
- **AC:** Route `/me/sessions/[id]/edit`; inline edit captures; soft-delete + restore; edit window enforced (7 days).
- **Refs:** `prototypes/atlas-ic-edit-capture.html`, PRD F2 / US-3.7
- **DoD:** Window expiry enforced in DB; edits propagate to opportunity evidence.

### ATL-306 · Sponsor executive view (toggle on manager dashboard)
- **AC:** Toggle in top right swaps to executive view: hero card with weekly digest summary + top opportunities + sprint health bar.
- **Refs:** `prototypes/atlas-manager-dashboard.html` (executive view)
- **DoD:** Same data, different rendering; no separate fetches needed.

### ATL-307 · Email cadence: weekly IC summary (opt-in)
- **AC:** Optional weekly summary for ICs showing what they contributed; opt-out link.
- **Refs:** PRD F9.1
- **DoD:** Opt-in flag respected; no quotes shown.

### ATL-308 · Internal Twistag dogfooding sprint kicked off
- **AC:** Real Atlas sprint launched on a Twistag team (delivery ops or product) — eats our own dogfood.
- **DoD:** Sprint live; weekly retros scheduled.

---

## Sprint 05 (weeks 9-10) — Opportunity surfacing + scoring

**Goal:** Captures cluster into opportunities; scoring engine produces composite scores + rationale.

### ATL-400 · Opportunity clustering job
- **AC:** Inngest job triggered every 5 new captures within a sprint; clusters via embedding similarity (cosine ≥0.75); groups by primary department.
- **Refs:** `docs/03-conversational-engine.md` §7
- **DoD:** Test: 50 synthetic captures → 4-6 clusters formed; cluster summaries pass reviewer sanity check.

### ATL-401 · Opportunity candidate generation (LLM)
- **AC:** For each cluster with ≥3 captures from ≥2 contributors: LLM generates title + description + tags.
- **Refs:** `prompts/scoring-rubric.md`
- **DoD:** 10 sample clusters produce 10 distinct, accurate titles + descriptions.

### ATL-402 · Scoring engine — 5 dimensions
- **AC:** LLM scores each dimension 0-10 with reasoning; composite computed; persisted to `opportunities`.
- **Refs:** `prompts/scoring-rubric.md` §1-5
- **DoD:** Score distribution sanity check.

### ATL-403 · Confidence calculation
- **AC:** Based on # distinct contributors, # corroborating signals, pattern matches; stored separately from composite.
- **Refs:** `prompts/scoring-rubric.md` §confidence
- **DoD:** Opportunities with confidence ≤2 filtered out of default view; visible in "weak signals" toggle.

### ATL-404 · Auto-rationale generation
- **AC:** Per opportunity, LLM generates 100-150 word rationale citing 2-3 captures by role; persisted to `opportunities.rationale`.
- **Refs:** `prompts/scoring-rubric.md` §auto-rationale
- **DoD:** Rationale renders cleanly in opportunity detail page; no individual names included.

### ATL-405 · Provisional → surfaced state transition
- **AC:** Opportunities start `provisional`; after day 7 of sprint, promoted to `surfaced` (visible to sponsor).
- **DoD:** Transition runs nightly; no manual intervention needed.

### ATL-406 · Opportunity list view (manager + Twistag-side)
- **AC:** List of all opportunities with score badges, $ impact pills, evidence count, time-to-ship.
- **Refs:** `prototypes/atlas-manager-dashboard.html` opportunity list
- **DoD:** Pagination, filters by category + score, sort by composite.

### ATL-407 · Pattern matching against public.patterns
- **AC:** Vector similarity search returns top 3 matches per opportunity; persisted to `opportunity_pattern_matches`.
- **Refs:** `docs/02-architecture.md` §4.1
- **DoD:** Seeded with 5 hand-crafted patterns; visible in opportunity detail. Twistag-internal only — not surfaced to client.

### ATL-408 · Opportunity detail page
- **AC:** Route `/sprint/[sprintId]/opportunity/[id]`; hero, scoring breakdown, tabs (Evidence, Signals placeholder, Patterns, Discussion).
- **Refs:** `prototypes/atlas-opportunity-detail.html`
- **DoD:** Evidence tab shows quotes attributed by role; click expands to see full context.

---

## Sprint 06 (weeks 11-12) — Approve + SOW + Twistag cockpit

**Goal:** Sponsor approves opportunities → gets SOW draft. Twistag-side cockpit functional.

### ATL-500 · Discussion / internal comments
- **AC:** Threaded comments on opportunity; visible to manager + sponsor + Twistag-side; mention support (basic).
- **Refs:** `prototypes/atlas-opportunity-detail.html` discussion tab
- **DoD:** Comments persist; new comment triggers notification email (opt-in).

### ATL-501 · Approve-for-FDE sheet
- **AC:** Drawer/sheet opens from "Approve for FDE engagement" button; SOW draft auto-fills; editable scope/team/price/metrics.
- **Refs:** `prototypes/atlas-opportunity-detail.html` approve sheet
- **DoD:** Submitting writes `sow_drafts`, transitions opportunity to `approved`, emits `opportunity.approved` event.

### ATL-502 · SOW draft generation (LLM)
- **AC:** On approve event: LLM generates draft scope, inclusions, exclusions, team, timeline, price (heuristic).
- **Refs:** `docs/03-conversational-engine.md` §8
- **DoD:** Generated SOW reviewed by Twistag for 5 sample opportunities; quality ≥4/5 rating.

### ATL-503 · Twistag cockpit — multi-client overview
- **AC:** Route `/twistag`; multi-client table with health metrics; alerts banner; filters.
- **Refs:** `prototypes/atlas-twistag-cockpit.html` overview view
- **DoD:** Twistag user with `engagement_lead` role sees only assigned clients.

### ATL-504 · Twistag cockpit — client drill-down
- **AC:** Route `/twistag/client/[tenantId]`; stat strip, opportunity → FDE pipeline, internal notes, cross-portfolio matches.
- **Refs:** `prototypes/atlas-twistag-cockpit.html` drill-down view
- **DoD:** Internal notes persist; only Twistag users see them.

### ATL-505 · Pattern library page (Twistag-side)
- **AC:** Route `/twistag/patterns`; lists most-applied + emerging patterns; each card shows deploys, avg outcome, confidence.
- **Refs:** `prototypes/atlas-twistag-cockpit.html` library view
- **DoD:** Curatable by Twistag-admin role; seeded with 6-10 patterns from past Twistag work.

### ATL-506 · Twistag-side weekly digest email
- **AC:** Monday email to each engagement lead with health snapshot of their clients.
- **DoD:** Includes top alerts, recent FDE conversions, opportunity backlog summary.

---

## Sprint 07 (weeks 13-14) — Final report + edge states

**Goal:** Final report generates. All edge states covered.

### ATL-600 · Final report generator — HTML
- **AC:** On sprint completion: generates interactive HTML report at `/sprint/[id]/report`; matches prototype.
- **Refs:** `prototypes/atlas-final-report.html`, PRD F9.4
- **DoD:** Report includes cover, executive summary, methodology, opportunities, foundation gaps, roadmap, appendix.

### ATL-601 · Final report — PDF export
- **AC:** "Download PDF" button generates a PDF (Puppeteer/Playwright) matching the HTML layout.
- **Refs:** `prototypes/atlas-final-report.html`
- **DoD:** PDF renders correctly on Mac Preview + Adobe Reader; <5s to generate.

### ATL-602 · Empty states
- **AC:** Day 1 manager dashboard; Day 0 IC home; Twistag-side with no clients.
- **Refs:** `prototypes/atlas-states.html`
- **DoD:** All empty states use design system; show "what would normally be here + how to get there".

### ATL-603 · Error states
- **AC:** Magic link expired; session interrupted; person left the company; tenant suspended.
- **Refs:** `prototypes/atlas-states.html`
- **DoD:** Each error has remedy CTA; Highlight/Sentry captures unexpected errors.

### ATL-604 · Loading + skeletons
- **AC:** Skeleton states for slow-loading data; no spinners >2s.
- **Refs:** `docs/04-design-system.md`
- **DoD:** Skeleton blocks match layout dimensions.

### ATL-605 · GDPR export + delete endpoint
- **AC:** `POST /api/gdpr/export` returns ZIP of all user data; `DELETE /api/gdpr/user` soft-deletes and anonymizes within 30d.
- **Refs:** `docs/06-security-compliance.md`, PRD F10.4
- **DoD:** Tested with synthetic user; output reviewed for completeness.

### ATL-606 · Rate limiting per tenant
- **AC:** Per-tenant rate limits on API + LLM calls; Inngest enforces concurrency.
- **DoD:** Test: simulate burst → graceful 429s.

---

## Sprint 08 (weeks 15-16) — Hardening + pilot prep

**Goal:** Production-quality alpha. Pilot onboarding ready.

### ATL-700 · Accessibility audit pass
- **AC:** All Tier-1 components pass WCAG AA (Axe + manual); keyboard nav works; screen reader friendly.
- **Refs:** `docs/04-design-system.md` §7
- **DoD:** Lighthouse a11y score ≥95 on all primary routes.

### ATL-701 · Eval framework — production sample
- **AC:** Weekly Inngest job samples 5% of last week's sessions; Twistag-side reviewer UI for scoring; metrics dashboard.
- **Refs:** `docs/03-conversational-engine.md` §9
- **DoD:** First production sample reviewed; metrics in dashboard.

### ATL-702 · DPA template finalized
- **AC:** DPA template reviewed by external counsel; aligned to GDPR + DPAs needed per pilot.
- **DoD:** Template in `legal/dpa-template.docx`.

### ATL-703 · SOC2 Type 1 audit kicked off
- **AC:** SOC2 vendor (Vanta/Thoropass/Drata) connected; first evidence collection cycle started.
- **DoD:** Vendor dashboard shows initial collection.

### ATL-704 · Marketing site live
- **AC:** Landing + pricing pages deployed to `atlas.twistag.com`.
- **Refs:** `prototypes/atlas-landing.html`, `prototypes/atlas-pricing.html`
- **DoD:** SEO basics: meta tags, OG image, sitemap; <1s LCP on mobile.

### ATL-705 · Sales / onboarding deck
- **AC:** 12-slide pitch deck matching current product reality (no vapor).
- **Refs:** `prototypes/atlas-final-report.html` for tone
- **DoD:** Shared with all Twistag commercials.

### ATL-706 · Pilot 1 onboarding workflow documented
- **AC:** Step-by-step playbook for Twistag pilot rollout (Day -7 to Day +28).
- **Refs:** `docs/05-pilot-playbook.md`
- **DoD:** Reviewed with the Twistag engagement lead who'll run pilot 1.

### ATL-707 · Internal dogfooding sprint completion
- **AC:** Dogfood sprint (from ATL-308) completes; retro held.
- **DoD:** Findings documented; top 5 issues fixed before pilot 1.

---

## Sprint 09 (weeks 17-18) — Pilot 1 + Pilot 2 launch

**Goal:** First 2 pilots running. Daily monitoring.

### ATL-800 · Pilot 1 onboarding
- **AC:** Tenant created; sponsor + manager invited; first sprint launched within 48h of contract signed.
- **Refs:** `docs/05-pilot-playbook.md`
- **DoD:** Day-1 check-in held; any blocking issues triaged within 2h.

### ATL-801 · Pilot 2 onboarding
- **AC:** As ATL-800; sponsor briefed by Twistag engagement lead + PE operating partner.
- **Refs:** `docs/05-pilot-playbook.md`
- **DoD:** First sprint live by end of week.

### ATL-802 · Pilot triage process
- **AC:** Slack channel + on-call rotation for pilot issues; SLA: <2h response in business hours.
- **DoD:** First-week NPS from pilot 1 captured.

### ATL-803 · Iteration 1 — pilot feedback
- **AC:** Reserved capacity for fixes/improvements based on real pilot usage.
- **DoD:** Top 5 pilot issues addressed within sprint window.

---

## Sprint 10 (weeks 19-20) — Pilot 3 + first sprint completes

**Goal:** Pilot 3 live. First pilot completes its sprint. First FDE engagement signed.

### ATL-900 · Pilot 3 onboarding (SaaS scale-up)
- **AC:** Tenant + sprint live; direct-sale pricing applied.
- **Refs:** `docs/05-pilot-playbook.md`
- **DoD:** First session completed.

### ATL-901 · Pilot 1 sprint completion
- **AC:** Pilot 1 first sprint completes; final report delivered to sponsor.
- **DoD:** Sponsor reviews report; renewal conversation triggered.

### ATL-902 · First FDE engagement signed
- **AC:** Sponsor approves an opportunity → SOW signed → FDE engagement starts.
- **DoD:** SOW signed; FDE pod assigned.

### ATL-903 · Wave 1 retrospective
- **AC:** Pilots + Twistag team review what worked, what didn't, what changes for v1.5.
- **DoD:** Retro doc in `docs/retros/wave-1-retro.md`.

### ATL-904 · v1.5 prioritization
- **AC:** Based on pilot feedback, lock the top 5 v1.5 priorities (likely: Slack/Teams, Atlas Core subscription, SSO, system connectors basics, voice).
- **DoD:** v1.5 milestones drafted.
