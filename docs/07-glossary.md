# 07 — Glossary

> Terminology used across docs, code, and conversations.

---

## Product

**Atlas** — The product. An operational discovery sprint product.

**Atlas Sprint** — One discrete discovery engagement (3-4 weeks). In Wave 1, this IS the product. Tiers: Sprint Small ($25-40K), Sprint Standard ($45-70K), Sprint Plus ($70-95K).

**Atlas Core / Atlas Portfolio** — Subscription tiers deferred to v1.5. Documented in roadmap but not sold in Wave 1. Wait for Slack/Teams + persistent value loop before pitching.

**Pulse** — Twistag's proprietary AI SDLC. See [twistag.com/pulse](https://twistag.com/pulse). Atlas uses Pulse principles for delivery acceleration on FDE engagements but Pulse and Atlas are separate products.

**Conversation service** — Atlas's internal conversational layer. Lives at `apps/web/server/services/conversation/`. Prompt engineering + state machine + Claude API. Not a separate package; not branded externally.

## Roles

**IC** — Individual Contributor. The person doing the work; primary "interviewee" persona.

**Manager** — Department head running a sprint. Owns team outcomes.

**Sponsor** — Executive sponsor (CEO, CFO, COO). Decision-maker on opportunity approvals.

**Twistag Engagement Lead** — Senior Twistag person responsible for a client engagement.

**Twistag Account Manager** — Commercial owner of a client; renewals + expansion.

**FDE** — Forward-Deployed Engineer. A Twistag delivery role. AI-native engineering pods embedded with clients, building with Pulse.

## Process & artifacts

**Sprint** — A discrete discovery engagement window (3-4 weeks default).

**Topic** — A theme of conversation (e.g. "Quote-to-cash flow"). Each topic = 1 session per IC.

**Session** — One conversation between an IC and Atlas, ~5 minutes, on one topic.

**Arc** — One of 4 conversational phases within a session: Workflow walkthrough → Frustration mining → Edge cases → Tools & constraints.

**Probe** — A follow-up question after a vague IC answer. Max 2 per arc.

**Anchor question** — The opening question of an arc.

**Capture** — A structured insight extracted from a session. Tagged by kind (bottleneck, workaround, etc.).

**Opportunity** — A cluster of related captures that suggests a discrete fix/build. Scored on 5 dimensions.

**Composite score** — Weighted average of the 5 scoring dimensions. 0-10.

**Confidence** — A separate 1-5 score indicating how strongly the evidence supports the opportunity.

**Pattern** — A cross-client recurring opportunity shape. Lives in Twistag's pattern library. Internal-only in Wave 1.

**SOW (Statement of Work)** — Auto-drafted scope document for an approved opportunity. Becomes the basis for a Twistag FDE engagement.

**Final report** — The deliverable at sprint end. PDF + interactive HTML.

## Segments

**S1 — Funded tech / SaaS / AI scale-ups** — Series A-C product companies. Buyer: CTO / VP Eng. Twistag positioning: product-building partner, not bandwidth.

**S2 — PE firms** — Mid-market and large PE. Buyer: Operating partner. Direct, no white-label.

**S3 — PE portcos** — PE-owned operators, $50-500M, post-close (1-24 months). Buyer: CEO + sponsor.

**S4 — Consulting firms** — MBB, Big 4, boutiques. **Not in Wave 1 GTM** — direct only.

**S5 — Mid-market operators** — Independent operators, $50-500M, no PE. Buyer: CEO/Owner + CFO.

**S6 — High-intent hand-raisers** — Inbound from public requests. Triaged separately.

## Technical

**RLS (Row-Level Security)** — Postgres-native multi-tenancy enforcement. Every tenant-scoped table has `tenant_id` + RLS policies. See ADR-001.

**Tenant context** — `tenant_id` injected from JWT into every request; enforced at DB layer via RLS.

**GraphRAG** — Retrieval-augmented generation over a knowledge graph. Atlas uses a simplified version (pgvector + structured tables) in MVP.

**pgvector** — Postgres extension for vector similarity search. Used for embedding storage in MVP.

**Provisional → Surfaced** — Opportunity state transition. Provisional opportunities are not shown to sponsors until day 7 of sprint.

**WAC** — Weekly Active Contributors. The key adoption metric.

**Edit window** — 7-day window in which an IC can edit or delete their captures.

**Adversarial test** — Test that attempts a cross-tenant operation expecting it to be denied/empty. Required on every PR that touches RLS policies or tenant-scoped tables.

## Business

**Sprint revenue** — Revenue from Sprint engagements. The primary Wave 1 revenue stream.

**FDE pipeline** — Pool of approved opportunities ready to be converted to FDE engagements.

**FDE attach rate** — % of Sprint customers who convert at least one opportunity to an FDE engagement. Target ≥60%.

**Return rate** — % of clients who run a second Sprint within 12 months. Target ≥40%.

## Voice / brand

**Twistag** — The parent company. Builds Atlas.

**Outcome-aligned** — Pricing or engagement structure tied to measurable outcomes (vs. ticket-based / hours-based).

**Operational discovery** — What Atlas does, in 2 words. Use this in marketing copy.

**Discovery sprint** — What we call Atlas Sprint externally.

## Banned in copy

`leverage` · `unlock` · `seamless` · `robust` · `empower` · `game-changer` · `cutting-edge`

## Removed (no longer used)

- ~~Hermes~~ — Deprecated as a Twistag-wide engine concept for Atlas. The conversation layer inside Atlas is just code in `services/conversation/`. If Twistag's outbound product evolves and shares patterns later, extract a shared package then. YAGNI.
