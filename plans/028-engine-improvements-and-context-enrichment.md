# Atlas Engine Improvements — Detailed Implementation Plans

> Source: the "discovery is commoditized" LinkedIn post (two screenshots). It lists 10 analytical sub-skills a McKinsey discovery engagement performs and argues the *recipe* (discovery) is commoditized while the *restaurant* (defending the portfolio, building the operating model, deployment) is the real value. Atlas is a productized version of those 10 sub-skills, and its discovery→FDE bridge **is** the restaurant.
>
> This file contains **7 self-contained implementation tickets** derived from that mapping, ordered by dependency. Each can be promoted to `roadmap/backlog.md` and built independently (except where noted). Read these carefully before any build begins.

---

## Context recap — the 10 sub-skills vs Atlas today

| # | Sub-skill | Status | Becomes ticket |
|---|---|---|---|
| 3 | Pain Point Inventory | **Present** (`frustration`/`bottleneck` captures, Arc 2) | — |
| 4 | Workflow-to-AI Fit | **Present** (AI-suitability scoring dimension) | — |
| 5 | Quick-Win ID | **Partial** | **D** |
| 6 | Strategic-Bet ID | **Partial** | **D** |
| 1 | Stakeholder Map | **Partial** | **B** |
| 2 | Architecture / Shadow-IT Audit | **Partial** | **F** |
| 9 | Adoption-Risk Heatmap | **Partial** | **E** |
| 10 | Discovery Synthesis Memo | **Partial** | **G** |
| 7 | Capability-Gap (build vs buy) | **Gap** | **C** |
| 8 | Pilot Portfolio Designer | **Gap** | **A** ⭐ |

**Build order (by dependency & effort):** D → C → E → F → B → **A (flagship)** → G.

---

## Shared conventions (apply to every ticket)

These are the existing Atlas patterns the tickets reuse. Stated once here, referenced below.

- **New DB columns / tables:** add a new migration file `db/migrations/000N_<name>.sql` (latest is `0004_sow_and_approval.sql`) **and** mirror in `db/schema.ts`. Never edit an applied migration.
- **RLS on every new tenant-scoped table** (per CLAUDE.md): 4 tenant policies (`select`/`insert`/`update`/`delete`) `USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)` plus a `_twistag_read` policy `(auth.jwt() ->> 'twistag_role') IS NOT NULL`. Copy the exact shape from `opportunity_evidence` in `0002_dashboard_tables.sql`.
- **Adversarial test required** for every new table: a test that tries to read another tenant's row and expects 0 rows (co-located `*.test.ts`). **PRs touching RLS need 2 engineer approvals.**
- **Privacy by design:** role/department only, **never IC names** — critical for tickets B, E, F. Clustering/synthesis LLM calls receive only `{id, kind, summary}` (the `clusterCaptures` precedent), never `source_quote` or names.
- **Determinism:** anything that's arithmetic or selection logic is computed in **TypeScript**, not the LLM (the existing `computeComposite` precedent in `services/opportunity/score.ts`). The LLM only writes prose (titles, rationale, narrative).
- **Voice:** honest, no corporate-speak (CLAUDE.md style guide). Reuse the auto-rationale tone rules in `prompts/scoring-rubric.md`.
- **Recompute is service-role + audit-logged** (`services/opportunity/recompute.ts` via `withServiceRole()`). New synthesis steps that cross all contributors run the same way.

---

## Ticket D — Horizon classification (Quick-Win vs Strategic-Bet)

**Sub-skills #5 + #6. Effort: S. Dependencies: none. Build first — unlocks A and G.**

**Why.** CFOs fund a *barbell* (cheap proof points + one big bet), not a flat leaderboard. Today the report ad-hoc splits "Quick wins (≤3 weeks)" vs "high-impact builds (≥7.5)" inside `components/report/ReportArticle.tsx` — formalize this as a first-class, derived field every surface reuses.

**Design.** A derived `horizon` label per opportunity, computed in TS from existing dimension scores + `timeToShipWeeksHigh`. No new LLM output.
- `quick_win`: `time_to_ship` score ≥ 7 (≤4 wks) AND `dependency` score ≥ 7 (standalone) AND `change_mgmt` score ≥ 6 (low disruption).
- `strategic_bet`: `financial` score ≥ 7 AND at least one of (`time_to_ship` ≤ 5, `change_mgmt` ≤ 4, `dependency` ≤ 4) — i.e. big and slow/disruptive/foundation-dependent.
- `standard`: everything else.

**Changes.**
- `services/opportunity/score.ts`: add `export function computeHorizon(dimensionScores, timeToShipWeeksHigh): Horizon` next to `computeComposite`. Add `Horizon` type to `lib/types.ts` (`"quick_win" | "strategic_bet" | "standard"`).
- `services/opportunity/recompute.ts`: call `computeHorizon(...)` in `runRecompute` and include `horizon` in the opportunities insert/update.
- DB: new migration `0005_opportunity_horizon.sql` → `ALTER TABLE public.opportunities ADD COLUMN horizon text NOT NULL DEFAULT 'standard';` (no new RLS needed — existing table). Mirror in `db/schema.ts`. Add `horizon` to `lib/types.ts:Opportunity`.
- UI: replace the ad-hoc split in `ReportArticle.tsx` "Suggested roadmap" section with the `horizon` field; add a small horizon chip to the opportunity card (`components/...OpportunityCard`).

**Acceptance criteria.**
- Every recomputed opportunity has a `horizon`. Idempotent recompute preserves it.
- A unit test on `computeHorizon` covers each branch (quick win, strategic bet, standard, boundary cases).
- Report roadmap section renders from `horizon`, not the hardcoded `≤3 weeks / ≥7.5` thresholds.

**DoD.** Unit test green; migration applied; no LLM schema change; chip visible in report + opportunity detail.

---

## Ticket C — Build-vs-Buy / Capability-Gap classification

**Sub-skill #7 (true Gap). Effort: M. Dependencies: none.**

**Why.** The post's #7 is "internal vs vendor capability per use case" — distinct from Atlas's existing "foundation gaps" (which are *prerequisites*). A discovery tool owned by a services firm honestly saying "buy this off-the-shelf, don't build it" is a *trust* differentiator that wins the CFO meeting, and it sharpens SOW scope.

**Design.** Add an LLM-produced delivery recommendation per opportunity: `build` (FDE engagement) / `buy` (vendor tool exists) / `configure` (config change in existing system, no build). This is a judgment, so the LLM produces it (unlike horizon).

**Changes.**
- `services/llm/schemas.ts`: extend `opportunityScoring` with `delivery: z.enum(["build","buy","configure"])` and `deliveryRationale: z.string().min(10).max(400)`.
- `prompts/scoring-rubric.md`: add a short "Delivery path" section defining the three values, with the existing honesty note ("recommend buy when a mature vendor exists — don't manufacture build work").
- `services/opportunity/score.ts` + `recompute.ts`: pass `delivery`/`deliveryRationale` through to persistence.
- DB: migration `0006_opportunity_delivery.sql` → add `delivery text` + `delivery_rationale text` columns. Mirror in `db/schema.ts`, `lib/types.ts:Opportunity`.
- `lib/sow.ts`: when `delivery === "buy"`, adjust `buildSowDraft` scope/inclusions to a *vendor selection + integration* engagement rather than a full build (and flag in `exclusions`). Light branch.
- UI: delivery badge on opportunity card + a line in the report opportunity entry.

**Acceptance criteria.**
- Scored opportunities carry a valid `delivery` + rationale.
- `buy` opportunities produce a vendor-selection-flavored SOW draft, not a build SOW.
- Eval: add 2-3 ground-truth cases to the scoring eval set (`docs/03-conversational-engine.md` §9) where the correct answer is `buy` or `configure`.

**DoD.** Schema + migration + UI; SOW branch covered by a test; scoring eval cases added.

---

## Ticket E — Adoption-Risk Heatmap by function

**Sub-skill #9. Effort: M (read-mostly). Dependencies: none. Operationalizes risk R1 in `docs/08-risks.md`.**

**Why.** The post's restaurant story is an adoption-resistance story (HR blocks it, the GM refuses). Naming where resistance lives *before* the FDE engagement is deployment intelligence that isn't commoditized — and it de-risks Atlas's own conversion funnel.

**Design.** A derived, per-department view — no new persisted table needed; compute on read. For each department:
- `avgChangeMgmtScore` = mean of the `change_mgmt` dimension score across that department's opportunities (low score = high resistance).
- `resistanceSignalCount` = count of `workaround` + `sop` + tribal-knowledge-tagged captures in that department (proxy: a team that has worked around process for years resists change). Captures carry `user_id`→`department`; aggregate role-level only.
- `level` = derived band (low / medium / high resistance) from the two above.

**Changes.**
- New `server/trpc/routers/sprint.ts` procedure `adoptionRisk(sprintId)` returning `{ department, avgChangeMgmtScore, oppCount, resistanceSignalCount, level }[]`. Service-role aggregation across contributors, role/department only.
- New component `components/manager/AdoptionRiskHeatmap.tsx` (follow the `TeamProgress` pattern), inserted into `app/(app)/sprint/[id]/page.tsx` around the opportunities section.
- New report section in `ReportArticle.tsx` (template, no LLM) rendering the heatmap.

**Acceptance criteria.**
- Heatmap shows one row per department with a defensible resistance band.
- No individual names anywhere in the output (test asserts this).
- Departments with no opportunities are omitted (not shown as zero-risk).

**DoD.** tRPC procedure + test; manager-dashboard view; report section; privacy assertion test.

---

## Ticket F — Current-State Systems & Shadow-IT inventory

**Sub-skill #2. Effort: M. Dependencies: none.**

**Why.** Shadow-IT (the unofficial spreadsheets/Slack-DMs people actually rely on) is where the real workflow — and the best AI opportunities — hide. Atlas beats a top-down McKinsey systems audit here because it interviews the ICs who *use* the shadow tools. Atlas already captures `tooling` and `workaround` kinds and hunts shadow tools in Arc 4 / Probe Pattern D.

**Design.** A new synthesis artifact: cluster `tooling` + `workaround` captures into a current-state inventory, each item categorized `system` (official) / `shadow_tool` (unofficial) / `integration_gap` (missing seam).

**Changes.**
- `services/opportunity/cluster.ts` pattern reused: new `services/synthesis/systems.ts` with `clusterSystems(captures)` filtering to `kind ∈ {tooling, workaround}` and an LLM call (via `completeStructured`) returning `{ name, category, summary, captureIds }[]`. New Zod schema in `services/llm/schemas.ts` (`systemsInventory`).
- DB: new table `system_inventory_items` (`id, tenant_id, sprint_id, name, category, summary, created_at`) + an evidence join `system_inventory_evidence` (mirror `opportunity_evidence`). Full RLS (4 tenant + twistag_read) per shared conventions. **Adversarial cross-tenant test required.**
- Job: add a step to `services/jobs/functions/recompute.ts` (or a sibling job on the same `opportunity/recompute-requested` event) that runs `clusterSystems` and upserts inventory idempotently (cluster key = lowercased name, mirroring the opportunities idempotency pattern).
- tRPC: `twistag.clientDetail` / a `sprint.systemsInventory(sprintId)` procedure.
- UI: new tab in `components/admin/ClientTabs.tsx` and/or a report section.

**Acceptance criteria.**
- Inventory items categorized correctly on a fixture sprint; shadow tools surfaced from `workaround` captures.
- Idempotent re-run updates in place, no duplicates.
- Cross-tenant adversarial test passes (0 rows).

**DoD.** Table + RLS + adversarial test (2 approvals); synthesis service + schema; job step; view.

---

## Ticket B — Stakeholder Map

**Sub-skill #1. Effort: M. Dependencies: none (richer once A exists).**

**Why.** An opportunity you can't get approved is worthless. Mapping the approval chain per opportunity — decision-makers, blockers, adopters by function — is exactly the "defend it in the CFO's office" intelligence, and Atlas already extracts `decision` (approval gates) and `handoff` (coordination) captures, with Probe Pattern C surfacing hidden actors.

**Design.** A per-sprint synthesis: from `decision` + `handoff` captures + the participant roster, produce role-level stakeholders typed `decision_maker` / `blocker` / `adopter`, each with department and the opportunities they gate. **Role labels only, never names.**

**Changes.**
- New `services/synthesis/stakeholders.ts` with an LLM synthesis call (input: `decision`/`handoff` capture summaries + opportunity titles + roster roles; output Zod schema `stakeholderMap` in `services/llm/schemas.ts`): `{ roleLabel, department, type, summary, gatedOpportunityIds[] }[]`.
- DB: new table `stakeholders` (`id, tenant_id, sprint_id, role_label, department, type, summary, created_at`) + join `stakeholder_opportunity` (`stakeholder_id, opportunity_id`). Full RLS + adversarial test.
- Job: step on the recompute event (after opportunities exist, so `gatedOpportunityIds` can resolve). Idempotent by `(sprint_id, role_label, department)`.
- tRPC + new `components/manager/StakeholderMap.tsx` view + report section.

**Acceptance criteria.**
- Stakeholders derived only from `decision`/`handoff` captures + roster; **zero individual names** (test asserts).
- Each stakeholder links to the opportunities it gates.
- Runs after opportunity scoring in the same recompute cycle.

**DoD.** Table + RLS + adversarial + name-redaction test; synthesis service; view; report section.

---

## Ticket A — Pilot Portfolio Designer ⭐ (flagship)

**Sub-skill #8 (true Gap). Effort: L. Dependencies: D (horizon). Strongest value — the "restaurant" artifact.**

**Why.** Today `recompute.ts` surfaces a *ranked list* (cap 10, by composite). The post's #8 — and the whole CFO punchline — is a *curated, balanced 3-5 pilot portfolio*: a recommendation, not a leaderboard. This is the single biggest gap between "ranked backlog" (commoditized) and "board-ready decision" (the restaurant), and it directly strengthens the approve-for-FDE conversion that is Atlas's business model.

**Design.** A new first-class `portfolio` object per sprint: a TS selection of 3-5 surfaced opportunities optimizing a balanced spread, plus an LLM-written portfolio narrative.

*Selection (deterministic TS, in a new `services/synthesis/portfolio.ts`):* over surfaced opportunities with confidence ≥ 3, greedily/constraint-select 3-5 to satisfy:
- **Horizon balance:** ≥1 `quick_win` and ≥1 `strategic_bet` (from ticket D).
- **Department spread:** prefer distinct `departments[]` so it isn't all one team.
- **Risk balance:** avoid stacking all high-`change_mgmt`-cost or all high-`dependency`-depth bets.
- Within constraints, maximize summed `compositeScore`.

*Narrative (LLM):* reuse the auto-rationale prompt pattern (`prompts/scoring-rubric.md`) to write *why these 3-5, why now, sequencing logic, what they add up to as an operating-model move* — honest tone, no marketing-speak.

**Changes.**
- DB: new tables `portfolios` (`id, tenant_id, sprint_id, narrative, created_at`) + `portfolio_items` (`portfolio_id, opportunity_id, sequence_order, inclusion_rationale`). Full RLS (4 tenant + twistag_read) + adversarial test.
- `services/synthesis/portfolio.ts`: `selectPortfolio(opportunities): PortfolioSelection` (pure TS, unit-tested) + `writePortfolioNarrative(...)` (LLM). New `portfolioNarrative` schema in `services/llm/schemas.ts`.
- Job: add a final step to `services/jobs/functions/recompute.ts` after surfacing (portfolio depends on surfaced set). Idempotent: one portfolio per sprint, replaced in place. Approved opportunities are sticky in the portfolio (mirror the "never touch approved" rule).
- tRPC: `sprint.portfolio(sprintId)` (tenant) + a Twistag curation procedure to pin/swap items (mirror `twistag.opportunitySetStatus`).
- UI: a prominent **Pilot Portfolio** panel on the sponsor/manager dashboard (`app/(app)/sprint/[id]/page.tsx`) and a dedicated portfolio section near the top of `ReportArticle.tsx` (above the full ranked list).

**Acceptance criteria.**
- `selectPortfolio` always returns 3-5 items honoring horizon + department + risk balance when the input allows; unit tests cover degenerate inputs (e.g. fewer than 3 surfaced, all one department, no strategic bet available → documented fallback).
- Narrative cites the included opportunities by title and gives a sequencing rationale; no individual names.
- Idempotent recompute keeps one portfolio per sprint; approved items never dropped.
- Honest calibration: if fewer than 3 high-confidence opportunities exist, the portfolio says so rather than padding (CLAUDE.md numerical-promise rule).

**DoD.** Tables + RLS + adversarial test (2 approvals); pure-TS selector with full unit coverage; narrative service; dashboard panel + report section; curation procedure.

---

## Ticket G — Synthesis Memo narrative (board-ready)

**Sub-skill #10. Effort: L. Dependencies: A, B, E. Build last — it packages the others.**

**Why.** The post's #10 is a board-ready narrative. Atlas's final report (`ReportArticle.tsx`) is currently strong but **template-only, no LLM** — a set of sections, not a story. This ticket adds the connective narrative a sponsor forwards to their board: portfolio (A) → stakeholder approvals (B) → adoption risks (E) → a sequenced 12-month operating-model path. It's also the natural place to make the restaurant pitch explicit ("here is the portfolio, and here is who deploys it").

**Design.** An LLM-generated narrative layer cached on the sprint, generated when the sprint closes (report is otherwise template-based, so introduce one LLM call here — not on every page render).

**Changes.**
- New `services/synthesis/memo.ts`: `generateSynthesisMemo(sprint, portfolio, stakeholders, adoptionRisk, opportunities)` → a structured narrative (Zod schema `synthesisMemo` in `services/llm/schemas.ts`: `{ openingNarrative, portfolioStory, sequencingLogic, riskNarrative, recommendedNextStep }`). Inputs are already role-level, name-free.
- Job: new `services/jobs/functions/` function on `sprint/closed` (or extend the existing close flow / `report.final.generate`) that generates + persists the memo. DB: add `synthesis_memo jsonb` to `sprints` (migration; existing table, no new RLS) or a small `sprint_memos` table if versioning is wanted.
- UI: render the narrative as the opening of `ReportArticle.tsx`, above the template sections. Keep the template sections (they're the evidence backing the narrative).

**Acceptance criteria.**
- Memo generated once at sprint close, cached (no per-render LLM cost — guards the `$1.50/session` cost watch in `docs/03` §10).
- Narrative references the actual portfolio, stakeholders, and adoption findings (not generic).
- Honest tone; no marketing-speak; no individual names. Reviewed against the conversation-quality eval discipline.

**DoD.** Synthesis service + schema; persistence + job; report narrative renders; cost-guard verified (one call per sprint close).

---

## Cross-cutting verification (how to test the whole set)

1. **Unit-first for deterministic logic:** `computeHorizon` (D) and `selectPortfolio` (A) are pure functions — full unit coverage including boundary/degenerate cases, no LLM needed.
2. **Schema/LLM changes (C, F, B, G):** validate Zod outputs against fixtures; add cases to the existing scoring/extraction eval harness (`docs/03-conversational-engine.md` §9) so coverage/precision targets still hold.
3. **New tables (F, B, A; possibly G):** each gets the mandatory adversarial cross-tenant RLS test (expect 0 rows) and a name-redaction assertion. RLS-touching PRs need 2 approvals.
4. **End-to-end on a fixture sprint:** seed a sprint with captures spanning ≥2 departments and all 7 capture kinds, run `recompute`, and verify: opportunities carry `horizon` + `delivery`; systems inventory + stakeholder map + adoption heatmap populate; a balanced 3-5 portfolio is selected; the synthesis memo references all of the above. Use the existing `twistag.recompute` admin action / `RecomputeButton` to trigger.
5. **Cost guard:** confirm new LLM calls (C scoring delta, F/B synthesis, A narrative, G memo) keep per-sprint cost within the `docs/03` §10 envelope (~$200/sprint) — memo + narratives are per-sprint, not per-session.

---

## Open questions to resolve before building

- **A (portfolio) ownership:** is the portfolio sponsor-facing immediately, or Twistag-curated first (like opportunities surface after day 7)? Recommend Twistag-curated → then surfaced, mirroring the opportunity lifecycle.
- **Persistence vs compute-on-read:** E (adoption heatmap) is proposed compute-on-read; F/B/A are persisted tables. Confirm that's the right split (persisted where there's an LLM call + evidence links; computed where it's pure aggregation).
- **Scope/sequencing vs roadmap:** these consume opportunities, so they land most naturally in/after Phase 3 (Sprints 05-06, opportunity engine) per `roadmap/milestones.md`. D and C can start earlier as they extend scoring directly.

---

# Part 2 — Company Context Enrichment & Extraction Quality

> Separate, earlier-in-the-pipeline thread. The 7 tickets above improve **synthesis** (turning captures into a portfolio). This part improves the two **inputs** that bound how good that synthesis can ever be: (1) the company context the engine starts with, and (2) whether the conversation asks the right questions to capture what the report needs.

## The thesis (why these two are one problem)

Report value ≈ **starting context × question quality × synthesis**. Today both inputs are near-zero:

- **Context = nothing.** Conversation prompts are completely org-agnostic. The prompt literally addresses "a client team" — no industry, no business model, no systems, no prior findings. `tenants.metadata` (jsonb) is defined but **never written or read**.
- **Questions are generic and uncoordinated.** Every IC session is *identical* given role+topic. No session knows what any other session surfaced. And there's a structural mismatch: scoring needs **dollars** (`frequency × cost-per-incident`), the conversation only asks **hours**.

So a brilliant Portfolio Designer (Ticket A) is still working from thin, un-quantified, context-free evidence. Fixing the inputs raises the ceiling for everything downstream.

## Current state (grounded)

| Area | Today | File |
|---|---|---|
| Tenant record | `slug, name, segment, status, metadata{}` — `metadata` empty & unused | `db/schema.ts` (tenants); `app/(app)/admin/clients/new/actions.ts` |
| Company context | **None.** Not stored, not injected anywhere | — |
| Web search / enrichment | **None.** Only external call is Anthropic via `services/llm/client.ts` | — |
| Document upload | **Designed, not built.** `documents` table in `docs/02` only; no UI, no storage code, no text extraction, not used in prompts | `docs/02-architecture.md` |
| Topics | **100% manual** — 4 hardcoded templates, no personalization | `lib/topic-templates.ts`, `sprint.launch` in `server/trpc/routers/sprint.ts` |
| Prompt assembly | Injects only `userName, department, topicTitle, topicDescription, arc` | `services/conversation/prompts.ts:buildSystemPrompt` |
| Cross-session awareness | **None.** `loadHistory` scoped to `sessionId` only | `services/conversation/engine.ts` |
| Spec drift | Docs §3 prompt has `tenant_name, arc_history, captures_summary, probes_remaining` — **none implemented** | `docs/03` §3 vs `prompts.ts` |
| Financial probing | Asks frequency + **hours**; scoring needs frequency × **cost-per-incident** | `prompts/role-prompts/*` vs `prompts/scoring-rubric.md` §1 |

---

## Thread A — Company Context Enrichment (at org creation)

**Goal:** when Twistag creates a client org, build a structured company profile from (1) AI web search and (2) uploaded artifacts, then inject it everywhere it sharpens output.

### A1 — Company context store
- New `company_context` table (tenant-scoped, **twistag/service-role readable** — it feeds prompts but is internal): `tenant_id, summary, industry, business_model, size_band, revenue_band, maturity, key_systems text[], known_pains text[], sources jsonb, enriched_at, enriched_by, status`. Versioned/audited so Twistag can see what shaped a sprint.
- Rationale for a table over `tenants.metadata`: audit, evidence sourcing, review workflow, and it consumes the existing RLS + adversarial-test conventions. (`metadata` jsonb stays for small flags.)

### A2 — AI web search enrichment
- New `services/enrichment/` service. On org creation (or an **"Enrich" button** on the admin client-detail page), search the web for the company (name + domain), then summarize results via Claude into the A1 structured profile, with `sources` cited.
- **Recommended approach: use Claude's built-in web search tool through the existing `services/llm/client.ts` abstraction** — no new vendor, keeps the single-LLM-path + cost-tracking discipline (`llm_calls`). Alternative: a dedicated search API (Tavily/Brave). Either way this is a **new external capability → write an ADR in `docs/adrs/`** and confirm it's allowed under the environment network policy.
- **Human-in-the-loop:** Twistag reviews/edits the enriched profile before it goes live (it steers IC questions, so accuracy matters). Public info only; audit-log every enrichment call.

### A3 — Artifact upload ingestion
- Implement the already-designed `documents` table (`docs/02`) + Supabase Storage + an upload UI on the admin client-detail page. Extract text (PDF/DOCX → `extracted_text`), summarize into the A1 profile, keep `extracted_text` for later evidence/RAG.
- **Scope note:** "manual document upload" is explicitly **Wave 1 in-scope** per CLAUDE.md. The new part is the *summarize-into-context* step, not the upload itself.

### A4 — Inject context where it helps
- **Conversation** (`services/conversation/prompts.ts:buildSystemPrompt`): add a compact `companyContext` block ("You're helping {company}, a {industry} business that {summary}. Known systems: {key_systems}. Known pain areas: {known_pains}."). `loadContext` in `engine.ts` must also join the context row.
- **Topics:** layer context into the 4 template descriptions (keep manual templates as default; optionally AI-personalize descriptions). Full AI topic-generation is a later step.
- **Scoring** (`services/opportunity/score.ts`): pass company size/industry into the scoring prompt so financial baselines are grounded, not guessed.
- **Report** (`components/report/ReportArticle.tsx`): exec summary references the company context.

---

## Thread B — Does the chat ask the right questions for report value?

**Goal:** make the conversation reliably capture the evidence the report/scoring actually needs, and coordinate across sessions instead of repeating.

### B1 — Close the loop: coverage-aware questioning ⭐ (biggest lever)
Today sessions are independent; the engine can't fill gaps. Two tiers:
- **Tier 1 (moderate):** maintain a sprint-level "themes captured so far" summary (derived from existing captures, privacy-safe — themes, not names) and inject a compact version into later sessions' prompts so ICs can corroborate/extend rather than restate. Requires adding sprint-level read to `loadContext` + a new `captures_summary`-style block.
- **Tier 2 (ambitious, ~v1.5):** an active **gap director** that tracks which scoring dimensions are under-evidenced (esp. financial) and steers probes toward them, and can flag "financial signal weak — recommend one more Arc 2 session." This is real sprint-level state in the conversation loop.

### B2 — Fix the financial signal at the source
- Add explicit **cost-conversion probes** to role prompts: after frequency + time, probe "what would you estimate that costs?" — and/or capture a **role-level loaded hourly cost basis** once (manager input at setup, or derived from company context) so scoring multiplies real numbers.
- Consider a structured `quantified_impact` on captures (`frequency, unit_time, unit_cost, basis`) so scoring stops parsing prose. Feed the cost basis into `score.ts` so dollar math is grounded, not inferred from unstated salary assumptions.

### B3 — Implement the documented-but-missing prompt fields
- Add `tenant_name`/company context (Thread A), plus `arc_history`, `captures_summary` (within-session), and `probes_remaining` to `buildSystemPrompt`. Closes the spec drift in `docs/03` §3 and improves within-session coherence + probe-budget discipline. Cheap, high-leverage.

### B4 — Extend eval to measure report-relevant coverage
- Add to the eval harness (`docs/03` §9): **financial-signal coverage** (% surfaced opportunities backed by both frequency AND cost), **dimension coverage**, and cross-session gap detection — so question quality is measured against *report value*, not just raw capture count.

---

## Sequencing & scope (Part 2)

1. **B3 + B2** — cheapest, highest direct lift on report quality (prompt + light schema changes). Do first.
2. **A1 + A4** — context store + injection; foundational. Cheap once the store exists.
3. **A3** — artifact upload + summarize (partly Wave-1 in-scope).
4. **A2** — web search enrichment; **needs an ADR + network-policy check** before building.
5. **B1 Tier 1** — sprint themes into later sessions (moderate).
6. **B1 Tier 2 + B4** — gap director + coverage eval; most architectural, likely v1.5.

## Open questions (Part 2 — for later, per your note)

- **Web search:** Claude's built-in web search tool (recommended — no new vendor) vs a dedicated search API? ADR either way.
- **Cost basis source:** where does the per-role loaded hourly rate come from — manager input at setup, company-context inference, or a benchmark table?
- **Extraction ambition:** Tier 1 (inject captured themes) vs Tier 2 (active gap-director) for cross-session awareness — and is Tier 2 Wave 1 or v1.5?
- **Enrichment trust:** auto-enrich on org creation, or Twistag-triggered + reviewed before it goes live? (Recommend reviewed, since it steers IC questions.)

---

# Part 2 — Detailed Tickets (CTX-* context · EXT-* extraction)

> Same conventions as Part 1's "Shared conventions" section (new migration files, full RLS + adversarial test on new tables, TS-deterministic-vs-LLM split, role-only privacy, single LLM path via `services/llm/client.ts` with `llm_calls` cost tracking). Not repeated per ticket.
>
> **Build order:** EXT-3 → EXT-2 → CTX-1 → CTX-4 → CTX-3 → CTX-2 → EXT-1 → EXT-4.
> (Cheap prompt/schema lifts first; web search and the cross-session loop last.)

---

## EXT-3 — Implement the documented-but-missing prompt fields

**Effort: S. Dependencies: none (CTX-4 later fills `company context`). Build first.**

**Why.** `docs/03` §3 specifies a richer master prompt than what ships. `services/conversation/prompts.ts:buildSystemPrompt` injects only `userName, department, topicTitle, topicDescription, arc`. Missing: `tenant_name`, `arc_history`, `captures_summary` (what this session has captured so far), `probes_remaining`. Adding them improves within-session coherence and enforces the probe budget — pure prompt plumbing, no new data sources.

**Design / changes.**
- `services/conversation/state.ts`: expose probes-used-in-current-arc (state already enforces `MAX_TURNS_PER_ARC = 3`); derive `probesRemaining`.
- `services/conversation/engine.ts`: `takeTurn` already has the running transcript + per-turn captures. Build `arcHistory` (arcs completed) and `capturesSummary` (compact list of this session's captures so far) and pass them through.
- `services/conversation/prompts.ts:BuildSystemPromptOpts` + `buildSystemPrompt`: add `tenantName`, `arcHistory`, `capturesSummary`, `probesRemaining` and render the blocks exactly as `docs/03` §3 describes.
- `loadContext` in `engine.ts`: add `tenants.name` to the existing join (sessions→users→topics→**tenants**).

**Acceptance criteria.** Prompt contains all four fields; probe budget visibly decrements within an arc; a snapshot test of `buildSystemPrompt` output covers the new blocks; off-arc rate (eval §9) does not regress.

**DoD.** Prompt-assembly unit/snapshot test; `docs/03` §3 and implementation no longer diverge.

---

## EXT-2 — Fix the financial signal at the source

**Effort: M. Dependencies: none. Highest direct lift on report quality.**

**Why.** Scoring's financial dimension (`prompts/scoring-rubric.md` §1) requires `frequency × cost-per-incident` in **dollars**, but role prompts only elicit frequency + **hours**, forcing `services/opportunity/score.ts` to guess an hourly rate that was never captured. This is the weakest link between conversation and report.

**Design / changes.**
- **Probes:** add a cost-conversion probe to `prompts/role-prompts/*.md` (after frequency+time: "roughly what would you estimate that costs — or how many hours a year does it burn?"). Tie to Probe Pattern A (Quantify) in `prompts/probe-patterns.md`.
- **Cost basis:** capture a per-role **loaded hourly rate** once (manager input at sprint setup, or derived from CTX-1 company context). Store as `cost_basis jsonb` (role→hourly) on `sprints` (migration; existing table, no new RLS) — defaults from a benchmark table if unset.
- **Structured impact:** extend the capture schema `capturedItem` in `services/llm/schemas.ts` with optional `quantifiedImpact: { frequencyPerYear?, unitMinutes?, unitCostUsd?, basis? }`; persist new nullable columns on `captures` (migration). `services/conversation/extract.ts` populates it when the user gives numbers.
- **Scoring:** `services/opportunity/score.ts` — include `cost_basis` + any `quantifiedImpact` in the `captureBlock` so the financial estimate multiplies real numbers instead of inferring salary.

**Acceptance criteria.** A capture with "20×/month, 2 hrs each" yields a structured `quantifiedImpact`; scoring's financial reasoning cites the cost basis; eval gains a **financial-signal coverage** check (see EXT-4).

**DoD.** Schema + migration + extract population + scoring wiring; role-prompt probes added; scoring eval cases that exercise the dollar math.

---

## EXT-1 — Coverage-aware questioning (cross-session loop) ⭐

**Effort: Tier 1 M · Tier 2 L. Dependencies: EXT-3. Tier 2 likely v1.5.**

**Why.** Every session is independent (`loadHistory` is `sessionId`-scoped) so the engine repeats questions and can't fill gaps. This makes the sprint converge on the evidence the report needs.

**Design / changes.**
- **Tier 1 — sprint themes context.** A precomputed, **privacy-safe** sprint-themes summary (themes only, no names) generated server-side (service-role, like recompute) and cached on the sprint (`sprint_themes jsonb`, migration). Refresh it in the existing `services/jobs/functions/recompute.ts` step. Inject a compact version into later sessions via `buildSystemPrompt` (reuse the `capturesSummary` block from EXT-3, sprint-scoped) so ICs corroborate/extend rather than restate. **Do not** read other ICs' raw captures in the IC's request context — use the cache to preserve the no-names privacy model.
- **Tier 2 — gap director.** Track which scoring dimensions are under-evidenced per sprint (derive from captures + provisional opportunities), inject targeted probe guidance ("financial signal is thin — if cost comes up, push for numbers"), and surface a Twistag-side recommendation ("recommend one more Arc 2 session"). Real sprint-level state in the conversation loop.

**Acceptance criteria.** Tier 1: later sessions' prompts include sprint themes; no individual names anywhere (asserted). Tier 2: a sprint with weak financial signal produces a visible "needs more investigation" flag.

**DoD.** Tier 1: cache column + job step + injection + privacy test. Tier 2: dimension-coverage tracker + steering + Twistag recommendation surface.

---

## EXT-4 — Extend eval to measure report-relevant coverage

**Effort: M. Dependencies: EXT-2 (for financial metric). Pairs with EXT-1.**

**Why.** The eval harness (`docs/03` §9) measures capture coverage/precision/probe-appropriateness/off-arc — but not whether the sprint captured what the **report** needs.

**Design / changes.** Add metrics to the eval harness: **financial-signal coverage** (% surfaced opportunities backed by both frequency AND cost), **dimension coverage** (each scoring dimension has ≥1 supporting capture), and **cross-session gap detection**. Wire into the CI eval run and the weekly production-sample review.

**Acceptance criteria.** New metrics computed on the ground-truth + production-sample sets; drift alert (`>5pp`) extends to them.

**DoD.** Metrics implemented + thresholds documented in `docs/03` §9.

---

## CTX-1 — Company context store

**Effort: M. Dependencies: none. Foundation for CTX-2/3/4.**

**Why.** There is nowhere to put company context today; `tenants.metadata` is empty and unused.

**Design / changes.**
- New table `company_context` (tenant-scoped): `id, tenant_id, summary, industry, business_model, size_band, revenue_band, maturity, key_systems text[], known_pains text[], sources jsonb, status, enriched_at, enriched_by, created_at`. Migration `000N_company_context.sql` + `db/schema.ts`.
- **RLS:** tenant `select` for all tenant users (it's injected into IC prompts server-side, so the IC's JWT must read it) + tenant `insert/update/delete` restricted, plus `_twistag_read`/write. Writes happen via service-role/twistag only. **Adversarial cross-tenant test required.**
- `lib/types.ts`: `CompanyContext` type.

**Acceptance criteria.** Twistag can create/edit a context row; tenant users can read theirs; cross-tenant read returns 0 rows (test).

**DoD.** Table + RLS + adversarial test (2 approvals); type; basic read/write path.

---

## CTX-4 — Inject company context into prompts, scoring, and report

**Effort: M. Dependencies: CTX-1, EXT-3.**

**Why.** Context only helps once it reaches the LLM and the report. Everything that consumes a prompt today is org-agnostic.

**Design / changes.**
- `services/conversation/engine.ts:loadContext`: join the `company_context` row.
- `services/conversation/prompts.ts:buildSystemPrompt`: add a `companyContext` block ("You're helping {company}, a {industry} business that {summary}. Known systems: {key_systems}. Known pain areas: {known_pains}."). Reuses the `tenantName` slot from EXT-3.
- `lib/topic-templates.ts` / `sprint.launch`: layer context into the 4 template descriptions (keep manual templates as default; AI-personalized descriptions optional).
- `services/opportunity/score.ts`: pass industry/size into the scoring prompt so financial baselines are grounded.
- `components/report/ReportArticle.tsx`: reference company context in the executive summary.

**Acceptance criteria.** A seeded context makes the IC prompt company-specific (snapshot test); scoring prompt includes size/industry; report exec summary reflects it.

**DoD.** Injection across all four surfaces; snapshot test on the prompt; no regression to off-arc rate.

---

## CTX-3 — Artifact upload + ingestion

**Effort: L. Dependencies: CTX-1.**

**Why.** Uploaded artifacts are a high-signal context source; "manual upload" is Wave-1 in-scope (CLAUDE.md), but the `documents` table is designed-not-built and nothing ingests it.

**Design / changes.**
- Implement the `documents` table from `docs/02-architecture.md` (`tenant_id, filename, mime_type, storage_key, uploaded_by, sprint_id?, status, extracted_text, uploaded_at`) — migration + `db/schema.ts` + full RLS + adversarial test.
- Upload UI on the admin client-detail page (`app/(app)/admin/clients/[tenantId]/`) + a Supabase Storage write (clients already exist under `lib/supabase/`).
- New `services/enrichment/documents.ts`: extract text (PDF/DOCX → `extracted_text`), summarize into the CTX-1 profile via the LLM client. Run as an Inngest job on upload (`document/uploaded` event in `services/jobs/client.ts`).

**Acceptance criteria.** Upload → text extracted → company-context summary updated with the document cited in `sources`; cross-tenant document read returns 0 rows (test).

**DoD.** Table + RLS + adversarial test; upload UI + storage; extraction/summarize job; sources cited.

---

## CTX-2 — AI web search enrichment

**Effort: L. Dependencies: CTX-1. Needs ADR + network-policy check before building.**

**Why.** The fastest way to seed context at org creation is a web lookup of the public company profile.

**Design / changes.**
- **ADR first** (`docs/adrs/`): new external capability. **Recommended: Claude's built-in web search tool via `services/llm/client.ts`** (no new vendor; keeps the single LLM path + `llm_calls` cost tracking). Alternative: a dedicated search API (Tavily/Brave). Confirm the environment **network policy** permits it.
- New `services/enrichment/search.ts`: given company name + domain, run web search, summarize results into the CTX-1 structured profile with `sources` cited. Audit-log every call.
- Admin: an **"Enrich" button** on the client-detail page (not auto-on-create) → **Twistag reviews/edits** the result before `status` flips to active, since it steers IC questions. Public info only.

**Acceptance criteria.** Enrich produces a reviewable draft profile with cited sources; nothing reaches IC prompts until a human approves; cost logged.

**DoD.** ADR merged; enrichment service; review workflow + admin button; audit + cost tracking.

---

## Part 2 verification (end-to-end)

1. **Prompt snapshots** for EXT-3 + CTX-4 (company-specific, with arc history / captures summary / probe budget).
2. **Financial path** (EXT-2): fixture capture with numbers → structured `quantifiedImpact` → scoring cites cost basis → EXT-4 financial-coverage metric green.
3. **New tables** (CTX-1, CTX-3): adversarial cross-tenant test (0 rows) + name-redaction where applicable; RLS PRs need 2 approvals.
4. **Enrichment** (CTX-2/3): seed an org, run web enrich + upload a doc → company-context profile populated with sources → IC prompt becomes company-specific on the next session.
5. **Cross-session** (EXT-1): two sessions in one sprint; second session's prompt shows sprint themes; assert no names; Tier 2 weak-signal flag appears when financial signal is thin.
6. **Cost guard:** enrichment + per-session context injection stay within the `docs/03` §10 envelope; enrichment is per-org, not per-session.
