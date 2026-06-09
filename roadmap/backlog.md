# Backlog — items not yet in a sprint

> Parking lot. Pull into a sprint when capacity allows.

---

## v1.5 candidates (post-MVP, weeks 18-30)

### ATL-B01 · Slack/Teams bot integration
Full async conversational delivery via Slack and Teams. Requires:
- Bot user provisioning per workspace
- DM-based conversation flow
- Adaptive cards for sessions in Teams
- Per-workspace privacy review by client IT

### ATL-B02 · Voice mode
Whisper STT + Cartesia/ElevenLabs TTS. Toggle per session.

### ATL-B03 · SSO via WorkOS
Entra, Google Workspace, Okta. Magic link remains as fallback.

### ATL-B04 · System connectors v1
- Salesforce (read-only)
- HubSpot
- Notion
- Google Drive (DOCs)
- Slack/Teams metadata only

### ATL-B05 · Pull capability (ask the bot)
IC can ask "how does X work here?" and Atlas answers from the graph or flags the gap.

### ATL-B06 · Automated reflective layer
Post-deploy: connect to a KPI source, auto-track delivered impact vs predicted.

### ATL-B07 · Cross-portfolio insights (live)
Opt-in cross-tenant pattern matching for PE Portfolio tier.

---

## v2 candidates (beyond month 18)

### ATL-B11 · Atlas Marketplace
Playbooks pre-built for verticals, sold to clients.

### ATL-B12 · Atlas Autopilot
Agents implementing simple low-stakes quick wins automatically.

### ATL-B13 · Atlas Benchmark
Opt-in industry benchmarking.

### ATL-B14 · Mobile-native apps
iOS + Android with native notification support.

### ATL-B15 · Vertical wedges
Atlas for Healthcare, Atlas for Financial Services.

---

## Quality / debt items

### ATL-Q01 · LLM eval CI gate
On every prompt change PR: run ground-truth eval; block merge if coverage drops >3pp.

### ATL-Q02 · Tenant data export tooling
Self-serve export for clients (renewal moment).

### ATL-Q03 · Performance budget
First contentful paint <800ms on all primary routes; LLM response P95 <3.5s.

### ATL-Q04 · Cost monitoring + alerts
Per-tenant daily LLM spend alerts.

### ATL-Q05 · Adversarial conversation tests
Prompt injection, sensitive content disclosure, refusal patterns.

---

## Research / spikes

### ATL-R01 · Neo4j vs pgvector at 10+ tenants
When 5+ active tenants, re-evaluate vector + graph storage. Decision recorded as ADR.

### ATL-R02 · Self-serve onboarding feasibility
Test if mid-market sponsor can complete onboarding without Twistag-side help.

### ATL-R03 · Pricing experiments
A/B test sprint pricing tiers; understand elasticity.

---

## Process

When pulling from backlog into a sprint:
1. Confirm acceptance criteria are clear; add if missing
2. Add dependencies (`blocked by`, `blocks`)
3. Estimate (S / M / L); avoid splitting later
4. Move ticket from `backlog.md` to the active `sprints.md` sprint section
