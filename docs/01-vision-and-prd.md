# 01 — Vision & PRD

> Wave 1 MVP. Sprint-mode product only. Subscriptions deferred to v1.5 until Slack/Teams makes "persistent" honest.

---

## 1. North star

**In 24 months (longer horizon than original v1 plan), Atlas is the operational discovery sprint product for 30+ mid-market and PE-backed clients, generating $1.2M+ from Sprint engagements and creating the pipeline for $3M+ in Twistag FDE engagements.**

Atlas wins because it occupies a gap nobody else covers cleanly in this segment:
- Conversational interview platforms (Listen Labs, Perspective AI) focus on external customers, not internal operations.
- Process mining (Celonis, KYP.ai) reads system logs, can't capture tribal knowledge.
- Enterprise knowledge platforms (Glean, Microsoft Copilot) are retrieval-first, not outbound-first.
- Big consulting (MBB, Big 4) and PE in-house teams (Vista Agentic Factory) do similar work but only at the top of the market.

Atlas serves **mid-market operators, PE portcos, PE firms direct, and funded SaaS/AI scale-ups** — the segments where the labs and the boutiques don't reach with productized IP.

## 2. Problem statement

Mid-market and PE-backed operators need to know **where time, margin, and decisions actually go** before they can intelligently invest in AI/automation. The two existing options are bad:

1. **Big consulting ($250K-$1.5M, 3-6 months):** thorough but stale by month two. PDF deliverable. Tribal knowledge stays in two senior reps' heads.
2. **AI Readiness Sprint boutiques ($25K-$90K, 2-3 weeks):** cheaper, but same snapshot model. No IP. No defensible signal. Quality varies with whoever shows up to interview.

In both cases: the output is a "list of opportunities" without auditable rationale and without a clear path to implementation.

Atlas solves this by being a **focused sprint product** that:
- Captures organizational knowledge via short, structured conversations (5min per session, scheduled async via magic-link web).
- Produces a ranked, ROI-scored opportunity backlog with click-through evidence.
- Auto-drafts SOWs for approved opportunities, kicking off Twistag FDE engagements with minimal friction.

## 3. Wave 1 MVP scope

### In scope

- Multi-tenant web app (no Slack/Teams).
- Magic link auth (Stytch); no SSO.
- Manager-led sprint setup wizard (3-4 week sprint, custom topics, manual team invitation).
- IC conversational sessions (text-only, ~5min, async).
- Manager dashboard + executive view (read in same workspace).
- Knowledge graph backed by Supabase Postgres + pgvector (RLS-based multi-tenancy).
- Opportunity engine: scoring across 5 dimensions, auto-rationale with cited evidence.
- Approve-for-FDE flow: auto-drafted SOW preview, comments, internal-only routing.
- Twistag-side cockpit: multi-client overview, drill-down.
- Final report deliverable (PDF + interactive HTML).
- Email cadence (invitations, reminders, weekly digests).
- IC edit window (7-day soft delete + edit).
- Manual document upload (PDF, DOCX, MD, TXT).

### Out of scope (deferred to v1.5 / v2)

- **Atlas Core / Ship / Portfolio subscription tiers** — these come when Slack/Teams + persistent value loop is real
- **White-label channel partnerships** — direct sales only
- Slack/Teams bots — v1.5
- Voice mode (Whisper, TTS) — v1.5
- SSO (Entra, Google, Okta) — v1.5
- System signal connectors (Salesforce, HubSpot, NetSuite) — v2
- Knowledge connectors (Notion, Confluence, Drive) — v2
- Cross-portfolio insights — v2 (requires ≥5 clients)
- Pattern library as buyer-visible feature — Twistag-internal only in Wave 1
- Reflective layer auto-KPI input — v2
- Pull capability ("ask Atlas a question") — v2
- Mobile-native apps — never (mobile-responsive web is fine)
- Self-serve onboarding — Twistag-assisted in Wave 1
- Vertical specializations — v2

### Out of scope forever

- Sentiment / emotional analysis of employees
- Individual performance scoring
- Surveillance-style listening to communication channels

## 4. Personas

### P1 — Sponsor / Buyer

| Field | Detail |
|---|---|
| Role | CEO, CFO, COO, CTO (if technical), Head of Transformation |
| Org context | Mid-market $50M-$500M, or PE portco post-close, or PE operating partner |
| Goal | Defensible AI/automation roadmap with ROI for next board / quarter |
| Pain | Has been pitched too many decks; no patience for 18-month roadmaps |
| How they buy | Warm intro + demo + reference; not via marketing alone |
| Success metric | At least one FDE engagement converted with measurable ROI in 6 months |

### P2 — Department Head / Manager

| Field | Detail |
|---|---|
| Role | Head of Ops, Head of Finance, Head of Sales/RevOps, Director |
| Goal | Visibility into what's broken in their team without running new meetings |
| Pain | Can't get IT/CTO budget; tools die from lack of adoption |
| Interaction | Daily/weekly, via dashboard; runs the sprint operationally |
| Success metric | Sprint completes with ≥2 quick wins identified, team didn't hate it |

### P3 — Individual Contributor (IC)

| Field | Detail |
|---|---|
| Role | The actual operator: AE, analyst, controller, CS manager, engineer |
| Goal | Be left alone to do their work |
| Pain | "Another tool, another login, another HR survey" |
| Interaction | 4 sessions of ~5min each over the sprint window, via magic-link web |
| Success metric | Didn't feel like overhead; saw something improve in their workflow later |

### P4 — Twistag Engagement Lead

| Field | Detail |
|---|---|
| Role | Twistag senior, owns one or more client engagements |
| Goal | Clean opportunity backlog → ≥1 FDE conversion per sprint per client |
| Interaction | Daily via Twistag cockpit |
| Success metric | Pipeline health metrics + FDE conversion rate |

### P5 — Twistag Account Manager / Partner

| Field | Detail |
|---|---|
| Role | Commercial, owns repeat engagements + expansion |
| Goal | Forecastable Sprint revenue + FDE pipeline |
| Interaction | Per-sprint health dashboard |
| Success metric | ≥40% of pilots return for second sprint; FDE attach rate ≥60% |

## 5. User stories (consolidated)

> Each story below maps to one or more tickets in the sprint backlog. Story ID format: `US-<persona>.<n>`.

### Sponsor (US-1.x)
- US-1.1 — Sign sprint engagement, see kickoff within 14 days
- US-1.2 — Pick departments + timeline for first sprint
- US-1.3 — Receive weekly executive digest by email
- US-1.4 — Approve opportunity for FDE engagement with 1 click
- US-1.5 — Real-time sprint progress visibility

### Manager (US-2.x)
- US-2.1 — Onboard team in <15 min (no IT needed)
- US-2.2 — Real-time team progress dashboard
- US-2.3 — Add/remove tasks from team's sprint plan
- US-2.4 — Review conversational output before it propagates to Twistag-side
- US-2.5 — Nudge laggards with personalized pre-drafted messages
- US-2.6 — Share session links manually for internal Slack/Teams posting

### IC (US-3.x)
- US-3.1 — Access via magic link, no password
- US-3.2 — Complete each session in <6 minutes
- US-3.3 — See time estimate before starting
- US-3.4 — Pause/resume with persistent context + 24h email reminder
- US-3.5 — Understand privacy policy clearly
- US-3.6 — Mobile-friendly session interface
- US-3.7 — Edit captured insights within 7 days
- US-3.8 — Personal dashboard showing progress + completed sessions

### Twistag Engagement Lead (US-4.x)
- US-4.1 — Multi-client cockpit with health metrics
- US-4.2 — Drill into any opportunity with full evidence (quotes + patterns)
- US-4.3 — Convert opportunity to SOW in <2 days
- US-4.4 — Input post-deploy KPIs to recalibrate scoring (manual in MVP)

### Account Manager (US-5.x)
- US-5.1 — Client health alerts (WAC dropping, completion rate)
- US-5.2 — Auto-generated end-of-sprint debrief materials
- US-5.3 — Expansion signals dashboard

## 6. Functional requirements

### F1 — Onboarding & setup
- F1.1 Multi-tenant workspace, Twistag-assisted creation
- F1.2 Magic link auth via email (Stytch)
- F1.3 Manager invitation flow: add emails, role tags, scope selection
- F1.4 Sprint setup wizard (5 steps: scope, team, topics, timeline, review)
- F1.5 Privacy disclosure shown to IC before first interaction
- F1.6 Per-IC opt-out granular controls

### F2 — Conversational capture
- F2.1 Web-based chat UI, text-only
- F2.2 Session = 4-6 minutes, 4-7 questions
- F2.3 Conversation service inside Atlas codebase (NOT a separate package) with 4-arc rubric
- F2.4 Probe logic adapts in real-time
- F2.5 Pause/resume with context persistence + email reminder on >24h idle
- F2.6 Structured output per task: transcript + extracted entities + tags
- F2.7 Progress bar visible during session
- F2.8 Live "what Atlas heard" side panel updates per turn

### F3 — Document capture
- F3.1 Manual upload via web (PDF, DOCX, PPTX, MD, TXT)
- F3.2 Bot proactively requests upload for mentioned-but-undocumented processes
- F3.3 Document parsing → entities into knowledge graph

### F4 — System signal ingestion → DEFERRED (v2)

### F5 — Knowledge graph
- F5.1 Schema: Workflow, Decision, Bottleneck, System, Role, Document, Metric, Quote
- F5.2 Multi-tenant via Row-Level Security (single schema, `tenant_id` column on every table)
- F5.3 pgvector for embeddings
- F5.4 Twistag-side visualization (web)

### F6 — Opportunity engine
- F6.1 Detect bottlenecks → candidate opportunities
- F6.2 5-dimension scoring (financial, time-to-ship, AI-suitability, change cost, dependency)
- F6.3 Auto-rationale with cited evidence (quotes; system signals deferred)
- F6.4 Sensitivity filter (manager-flagged items visible only to sponsor)
- F6.5 Department breakdown views

### F7 — Handoff to FDE
- F7.1 Sponsor approval action
- F7.2 Auto-drafted SOW with scope, team, timeline, price, success metrics
- F7.3 Hand to Twistag-side engagement lead for refinement

### F8 — Twistag-side cockpit
- F8.1 Multi-client dashboard
- F8.2 Health metrics: WAC, completion rate, NPS, time-to-first-opportunity
- F8.3 Internal-only pattern library (curated by Twistag, not buyer-visible in Wave 1)
- F8.4 Manual KPI input post-deploy

### F9 — Reporting
- F9.1 Auto-email weekly digest to sponsor
- F9.2 Manager dashboard (in-app)
- F9.3 Export opportunity backlog (PDF + CSV/JSON)
- F9.4 Final sprint report (PDF + interactive HTML)

### F10 — Admin & compliance
- F10.1 Admin console
- F10.2 Audit log
- F10.3 Data retention policies
- F10.4 GDPR export and deletion per contributor
- F10.5 RLS-based isolation verified by adversarial tests

## 7. Success metrics (Wave 1 alpha, 20 weeks)

### Product
- Activation: ≥65% of invited ICs complete first session in week 1
- WAC (sprint window): ≥75%
- Task completion rate: ≥60%
- Session time median: <6 min; P95 <12 min
- Signal quality (Twistag-side review): ≥4.0 / 5

### Business (24-month horizon)
- Sprint revenue end of month 12: $300-500K
- Sprint revenue end of month 24: $900K-$1.2M
- FDE pipeline generated end of month 24: $2.5M-$3.5M
- Gross margin on Sprint: ≥40%
- Return rate (2nd sprint within 12 months): ≥40%

### Twistag-side
- **5-10 opportunities surfaced** per client per sprint (calibrated, was 12)
- **1-3 high-impact** opportunities per sprint (calibrated, was 3)
- ≥20% approval rate
- ≥75% conversion of approved → FDE engagement
- Sponsor NPS ≥40

### Compliance
- SOC2 Type 1: month 14 (was month 12)
- SOC2 Type 2: month 22 (was month 18)
- P95 uptime: ≥99.5% in alpha, ≥99.9% GA

## 8. Pricing (Wave 1 — Sprint only)

| Tier | ICP | Price | Includes |
|---|---|---|---|
| **Sprint Small** | Mid-market <$200M; PE portco <100 employees | **$25-40K** | 3-week sprint, up to 30 contributors, final report, 1-2 pre-drafted SOWs |
| **Sprint Standard** | Mid-market $200-500M; PE portco 100+ employees | **$45-70K** | 4-week sprint, up to 60 contributors, final report, 2-3 pre-drafted SOWs |
| **Sprint Plus** | Multi-department or post-acquisition | **$70-95K** | 4-week sprint, up to 100 contributors, 2 departments, 3+ pre-drafted SOWs |

**Wave 1.5 subscription tiers (Atlas Core, Atlas Portfolio)** — documented in roadmap, not actively sold until Slack/Teams ships + persistent value loop is real (Q3 2026 target).

**No channel/white-label pricing.** Direct sales only.

## 9. Open decisions (still to confirm before build)

- [ ] **Naming final.** Default: Atlas. Alternatives: Compass, Lighthouse.
- [ ] **3 pilot customers identified** (1 portco, 1 mid-market, 1 SaaS scale-up).
- [ ] **Product lead hired** (full-time, internal or contractor).
- [ ] **Funding decision:** €1.6-2.3M over 20 months. Bootstrap vs raise?
- [ ] **SOC2 vendor:** Vanta vs Thoropass vs Drata.
- [ ] **Hosting region default:** EU (Frankfurt) vs US.

## 10. Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-06-07 | Web-only MVP (no Slack/Teams in Wave 1) | Isolate adoption risk; faster to alpha; lower compliance burden |
| 2026-06-07 | pgvector instead of Neo4j | MVP scope; revisit at >5 clients |
| 2026-06-07 | Magic link instead of SSO | Lower friction for pilots; SSO add-on in v1.5 |
| 2026-06-07 | Stytch as auth provider | Magic link UX maturity; SOC2-friendly |
| 2026-06-07 | Anthropic Claude Sonnet as default LLM | Best discovery conversation quality at MVP; abstracted via service layer |
| 2026-06-08 | **Drop "Hermes" branding for Atlas conversation layer** | It's just prompt engineering + state code + Claude API. No engine package needed. Avoid brand/governance overhead. |
| 2026-06-08 | **Sprint-mode only in Wave 1; subscriptions in v1.5** | Honest framing — "persistent copilot" requires Slack/Teams to be real |
| 2026-06-08 | **Direct sales only, no Atlas Channel** | White-label rev-share economics don't work; full delivery margins matter |
| 2026-06-08 | **RLS multi-tenancy (not schema-per-tenant)** | ADR-001. Supabase-native, operationally simple, industry-standard |
| 2026-06-08 | **20 weeks to alpha-with-pilots** (was 14) | Realistic estimate after ticket-by-ticket sizing |
| 2026-06-08 | **5-10 opps surfaced, 1-3 high-impact targets** (was 12 / 3) | Math doesn't support 12; calibrated to clustering reality |
| 2026-06-08 | **Ground truth dataset built via pre-Sprint-1 workshop** | Twistag has no transcribed past sessions; build synthetic dataset with role-play |
