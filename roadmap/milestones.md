# Milestones

> 20 weeks from kickoff to Wave 1 pilots running. 10 sprints × 2 weeks each.

---

## Phase 0 — Pre-build (week 0)

**Goal:** Foundations that don't require code.

### Milestone 0.1 — Ground truth workshop
- 1-2 day workshop: 5-8 Twistag people role-play discovery sessions with each other
- Each session recorded (Zoom), transcribed via Whisper
- 5-10 transcripts manually scored by senior Twistag for what a "good" capture looks like
- Becomes the ground truth dataset for eval framework

### Milestone 0.2 — Open decisions resolved
- Naming locked
- 3 pilot customers warm-confirmed (verbal yes)
- Product lead hired (or contracted)
- Funding decision made
- SOC2 vendor selected
- Hosting region default decided

**Demo at end:** Ground truth dataset + signed pilot LOIs (Letters of Intent).

---

## Phase 1 — Foundation (weeks 1-4 · Sprints 01-02)

**Goal:** Working skeleton — auth, RLS multi-tenancy, basic IC conversation, manager dashboard shell.

### Milestone 1.1 — Repo + infra (Sprint 01)
- Next.js 15 monorepo scaffolded
- Supabase project provisioned (EU region)
- Stytch tenant configured
- Vercel preview deployments working
- CI green (typecheck, lint, test)
- Tokens + Tailwind config in place
- shadcn/ui base components imported
- RLS adversarial test harness in place

### Milestone 1.2 — Auth + RLS multi-tenancy (Sprint 01)
- Magic link flow end-to-end
- JWT contains `tenant_id`
- `public.tenants` registry working
- RLS policies on first 2 tables (users, sprints)
- Adversarial tests passing on tenant isolation

### Milestone 1.3 — First conversation (Sprint 02)
- IC can magic-link in and start a session
- Conversation service returns first message from Arc 1 anchor
- User responds; service extracts captures and stores them
- Conversation persists across page reloads
- Side panel shows live captures
- Session completion writes summary
- Eval CI runs ground truth on prompt changes

**Demo at end of phase 1:** Live conversation in a tenant database, captures extracted and visible, adversarial tests green.

---

## Phase 2 — Manager loop (weeks 5-8 · Sprints 03-04)

**Goal:** Manager can set up a sprint, invite contributors, watch progress, nudge laggards. ICs can do all sessions.

### Milestone 2.1 — Sprint setup wizard (Sprint 03)
- 5-step wizard: scope → team → topics → timeline → review
- Topic templates seeded (Quote-to-cash, Exception handling, Tools, One change)
- Sprint goes to `active` status; invitations queued

### Milestone 2.2 — Invitation + cadence emails (Sprint 03)
- IC magic-link invitation sent (Resend)
- Idle reminder logic (24h after pause, 48h after no-response)
- Weekly digest emails for sponsor + manager

### Milestone 2.3 — Manager dashboard (Sprint 04)
- Stat strip (participation, completion, etc.)
- Team progress table with status badges
- Activity feed
- Nudge composer (LLM-drafted, channel picker)

### Milestone 2.4 — IC personal home + edit window (Sprint 04)
- IC dashboard: completed sessions, upcoming, next session CTA
- 7-day edit window: inline edit captures, soft-delete

**Demo at end of phase 2:** Sprint runs end-to-end internally on a Twistag team (dogfooding).

---

## Phase 3 — Opportunities + Twistag-side (weeks 9-12 · Sprints 05-06)

**Goal:** Opportunities surface, get scored, evidence drilldown works. Twistag-side cockpit functional.

### Milestone 3.1 — Opportunity surfacing (Sprint 05)
- Cluster captures via embedding similarity
- Generate candidate opportunities via LLM
- Score across 5 dimensions
- Persist with auto-rationale
- Target: 5-10 opportunities per sprint, 1-3 high-impact

### Milestone 3.2 — Opportunity detail + evidence (Sprint 05)
- Hero with scoring breakdown
- Tabs: Evidence (quotes), System signals (placeholder), Patterns, Discussion
- Drill-down shows real captures

### Milestone 3.3 — Approve-for-FDE flow + SOW draft (Sprint 06)
- Sheet/drawer with auto-drafted SOW
- Editable scope, team, price, timeline, metrics
- Approval triggers Twistag-side handoff

### Milestone 3.4 — Twistag cockpit (Sprint 06)
- Multi-client overview table
- Client drill-down with internal notes, pipeline, patterns
- Pattern library stub (manually-curated, Twistag-internal only)

**Demo at end of phase 3:** Full Twistag-internal demo with end-to-end flow + cockpit.

---

## Phase 4 — Hardening + Final report (weeks 13-16 · Sprints 07-08)

**Goal:** Production-ready alpha. Final report generates. All edge states covered. Compliance posture started.

### Milestone 4.1 — Final report generator (Sprint 07)
- PDF + HTML output
- 8-section structure (per prototype)
- Triggered automatically at sprint end OR manually by Twistag lead

### Milestone 4.2 — States, errors, polish (Sprint 07)
- Empty states, error states (magic link expired, session interrupted, person left)
- Loading states
- Error boundaries
- Accessibility audit pass

### Milestone 4.3 — Privacy/security hardening (Sprint 08)
- DPA template finalized
- RLS audit (monthly cadence kick-off)
- Audit log coverage check
- Soft-delete + GDPR export endpoint working
- SOC2 Type 1 audit kicked off

### Milestone 4.4 — Pilot onboarding ready (Sprint 08)
- Twistag-side workflow for pilot onboarding documented
- Sales/onboarding deck synced with current product reality
- Marketing site live (landing + pricing)
- Internal Twistag dogfood sprint completed

**Demo at end of phase 4:** Alpha-quality product, ready to onboard pilot 1.

---

## Phase 5 — Pilot wave 1 (weeks 17-20 · Sprints 09-10)

**Goal:** 3 pilots running concurrently. Feedback loops tight.

### Milestone 5.1 — Pilot 1 (Sprint 09)
- Onboard pilot 1 (recommended: mid-market operator, lowest commit friction)
- Day 1 → sprint launches
- Daily check-ins in week 1, weekly thereafter

### Milestone 5.2 — Pilot 2 (Sprint 09)
- Onboard pilot 2 (recommended: PE portco)
- Twistag engagement lead embedded with portco CEO

### Milestone 5.3 — Pilot 3 (Sprint 10)
- Onboard pilot 3 (recommended: SaaS scale-up)
- Direct-sale pricing applied

### Milestone 5.4 — First sprint completion + first FDE — by end of week 20
- First pilot completes sprint
- ≥1 opportunity approved
- First SOW signed
- Retrospective + plan v1.5

**Demo at end of phase 5:** 3 pilots live, ≥1 FDE engagement converted, sprint completion data.

---

## Phase 6 — v1.5 (weeks 21+) — out of MVP scope

Reserved for:
- Slack/Teams integration
- Voice mode
- SSO
- First system signal connectors
- SOC2 Type 1 closed (month 14)
- Atlas Core subscription tier launched

---

## Cross-cutting tracks

### Eval framework
- Week 0: ground truth dataset assembled in workshop
- Week 3: CI eval runs on prompt changes
- Week 5: weekly production sample review cadence kicks off (after first internal dogfooding)
- Week 16: target metrics hit (coverage ≥75%, precision ≥85%)

### Observability
- Week 2: structured logs
- Week 4: OpenTelemetry traces
- Week 8: per-tenant dashboards
- Week 16: full incident response runbooks

### Compliance
- Week 6: DPA template
- Week 10: SOC2 vendor selected
- Week 14: SOC2 Type 1 audit started
- Month 14 (post-MVP): SOC2 Type 1 closed
- Month 22: SOC2 Type 2 closed

### Adversarial testing & RLS audit
- Week 1: harness in place
- Every PR: required for tenant-scoped changes
- Monthly: full RLS audit by engineering lead
