# Plan 016: Opportunity engine — captures → clustered, scored, evidence-linked opportunities

> **Executor instructions**: Follow step by step; verify each step. On any STOP
> condition, stop and report. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 430d2f4..HEAD -- server/trpc/routers/opportunity.ts db/schema.ts services/ prompts/scoring-rubric.md`
> Plans 013 + 014 MUST be merged (real captures must exist). If not, STOP.

## Status

- **Priority**: P0 — blocks 2026-06-18 pilot launch
- **Effort**: L (the second-largest item of the week)
- **Risk**: HIGH — scoring quality is the sponsor-facing credibility surface.
  **Timeline risk is real**: the operator chose the full auto engine over
  curated promotion for launch week. Steps are ordered so that if time runs
  out after Step 4, the Twistag-curated fallback (Step 6) still makes the
  product honest — build Step 6 even if everything else lands.
- **Depends on**: plans/013, plans/014. Plan 020 (Inngest) optional — the
  recompute can run synchronously from a manual admin trigger first.
- **Category**: direction
- **Planned at**: commit `430d2f4`, 2026-06-11

## Why this matters

Sponsors approve opportunities; SOWs are drafted from them; the report ranks
them. Today every opportunity row is demo seed. The PRD promise is a "ranked,
ROI-scored opportunity backlog with click-through evidence". This plan makes
captures flow into opportunities: embed → cluster → LLM-score (via
`prompts/scoring-rubric.md`) → persist with linked evidence.

## Current state

- `opportunities` table is COMPLETE for this (`db/schema.ts:195-226`): title,
  description, category, departments[], impactLow/High,
  timeToShipWeeksLow/High, confidenceScore, `compositeScore numeric(3,1)`,
  `dimensionScores jsonb`, rationale, status, contributorCount,
  patternMatch jsonb, approvedAt/By.
- `opportunityEvidence` join table exists (`db/schema.ts:228`).
- `server/trpc/routers/opportunity.ts` has `listForSprint`, `get` (joins
  evidence→captures→users, maps job title to `contributorRole`, never exposes
  names — preserve this), and `approve` (line 69; writes `sow_drafts` via
  `lib/sow.ts`).
- `prompts/scoring-rubric.md` defines the 5 scoring dimensions; consumed by
  nothing today.
- pgvector: CLAUDE.md mandates "pgvector for embeddings"; the schema has NO
  embedding column yet. Supabase has the `vector` extension available.
- Dashboard copy already promises: "Opportunities promote from provisional to
  surfaced after day 7. Weak signals (confidence ≤ 2) are hidden by default."
  (`app/(app)/sprint/[id]/page.tsx:199-202`). Make the engine honor exactly
  that lifecycle (`provisional` → `surfaced`), or the copy lies.
- Calibration rule (CLAUDE.md): "5-10 opportunities surfaced per sprint, 1-3
  high-impact" — cap surfacing accordingly.

## Commands you will need

| Purpose     | Command                    | Expected |
|-------------|----------------------------|----------|
| Migrate dev | `npm run db:migrate`       | applies 0007 |
| Integration | `npm run test:integration` | all pass |
| Full gate   | `npm run verify`           | exit 0   |

## Scope

**In scope**:
- `db/schema.ts` + `db/migrations/0007_capture_embeddings.sql` (embedding
  column + ivfflat/hnsw index; enable `vector` extension if the migration
  pattern allows — check how `bootstrap.sql` enables extensions and follow it)
- `services/opportunity/embed.ts`, `cluster.ts`, `score.ts` + tests (create)
- `services/llm/schemas.ts` (extend: `opportunityScoring` Zod schema mirroring
  the `opportunities` columns)
- `server/trpc/routers/opportunity.ts` (add `recompute` procedure —
  twistagProcedure or managerProcedure per Step 5; add curation mutations per
  Step 6)
- `app/(app)/admin/clients/[tenantId]/**` (curation UI hooks — minimal)
- `db/opportunities.integration.test.ts` (extend)

**Out of scope**:
- SOW LLM generation (stays heuristic — separate fast-follow; `lib/sow.ts`
  untouched).
- Report layout changes; the report already renders ranked opportunities.
- `patternMatch` / pattern library — v1.5.
- Existing RLS policies (the new column rides existing captures policies).

## Git workflow

- Branch: `feat/016-opportunity-engine`; conventional commits. No push unless
  asked.

## Steps

### Step 1: Embeddings (migration 0007)

Add `embedding vector(1536)` (nullable) to `captures` via raw SQL migration
0007 (Drizzle schema: use the `vector` custom type — drizzle-orm supports
pgvector via `customType`; keep it minimal). Create
`services/opportunity/embed.ts` — Anthropic has no embeddings API, so use a
deterministic local strategy: pgvector is OPTIONAL at this stage. **Decision
gate**: if adding an embeddings provider (e.g. Voyage, OpenAI) is unacceptable
as a new vendor this week, implement clustering WITHOUT embeddings (Step 2's
LLM-clustering path) and skip this migration. Record the choice in the PR
description. Do not add a vendor without flagging it to the operator first —
that is a STOP-and-ask.

**Verify**: `npm run db:migrate` exit 0 (if taken); integration tests green.

### Step 2: Clustering

`services/opportunity/cluster.ts`: group a sprint's non-removed captures into
candidate themes.

- Embeddings path: cosine-similarity threshold grouping (no ML dep — plain
  TS).
- No-embeddings path (default if Step 1 deferred): single `completeStructured`
  call: input = all capture summaries (id + kind + summary), output = Zod
  `z.array(z.object({ theme: z.string(), captureIds: z.array(z.string().uuid()).min(2) }))`.
  At pilot scale (≤150 captures/sprint) one call fits comfortably in context.

Unit-test with fixture captures (happy, singleton-drop, empty).

**Verify**: `npm test -- services/opportunity/cluster` → pass.

### Step 3: Scoring

`services/opportunity/score.ts`: per cluster, `completeStructured` with the
system prompt assembled from `prompts/scoring-rubric.md` + the cluster's
captures (summary + sourceQuote + kind; NO user names — pass role/department
only). Output schema mirrors the table: title, description, category,
departments, impactLow/High (validate `low <= high`), timeToShipWeeksLow/High,
confidenceScore 1-5, dimensionScores (the rubric's 5 dimensions, each 0-10),
rationale (cites which capture summaries drove the score), compositeScore
computed in TS from dimensionScores per the rubric's weights (do NOT let the
LLM do arithmetic — compute, then round to 1 decimal).

**Verify**: unit tests with mocked LLM: bounds enforced, low>high rejected
and retried, composite computed deterministically.

### Step 4: Persistence + lifecycle

`recompute(sprintId)` orchestration (in `services/opportunity/recompute.ts`):
cluster → score → upsert. Rules:

- New opportunities insert with `status: "provisional"`; promote to
  `"surfaced"` only when sprint day ≥ 7 (the dashboard's stated rule) AND
  confidence ≥ 3. Cap surfaced at 10, ranked by compositeScore.
- NEVER touch rows with `status: "approved"` (sponsors acted on them).
- Replace evidence links (`opportunityEvidence`) for non-approved rows on each
  recompute; `contributorCount` = distinct userIds across evidence.
- Idempotent: recompute twice → no duplicates (match on a stable cluster key,
  e.g. lowercase title; keep it simple and documented).

**Verify**: integration test — seed captures, run recompute with mocked LLM
twice, assert counts stable, approved rows untouched, evidence linked.

### Step 5: Trigger

Expose `opportunity.recompute` as a `twistagProcedure` mutation (audited via
the existing `withTwistagContext`/audit pattern — see
`server/trpc/routers/twistag.ts` for the exemplar) plus a button in the admin
client drill-down ("Recompute opportunities"). Automatic scheduling moves to
plan 020 (nightly + on session completion). Manual trigger is the launch-week
safety: Twistag runs it after each day's sessions.

**Verify**: admin button visible to twistag persona; audit row written per run.

### Step 6: Curation safety valve (build even if time runs out earlier)

Admin-only mutations: `opportunity.update` (edit title/description/rationale/
impact ranges on non-approved rows) and `opportunity.setStatus`
(provisional ↔ surfaced ↔ hidden). Both audited. Minimal edit form in the
admin client drill-down. This is what makes the pilot honest if engine output
needs human polish on day 1 — Twistag reviews every surfaced opportunity
before the sponsor sees it (pilot playbook workflow).

**Verify**: integration tests for both mutations incl. "cannot edit approved";
audit rows present.

## Test plan

- Unit: cluster (3 cases), score (bounds/retry/composite), recompute key
  stability.
- Integration: full recompute on embedded-postgres with mocked LLM; idempotency;
  approved-row immutability; RLS adversarial (extend
  `db/opportunities.integration.test.ts` if any new table/column path needs it).
- Manual: one real-LLM recompute on the dev seed; eyeball rationale quality
  with the operator before launch.

## Done criteria

- [ ] `npm run verify` exits 0
- [ ] Recompute from real captures yields ≤10 surfaced opportunities with
  rationale + evidence links + composite scores
- [ ] Approved opportunities provably immune (test)
- [ ] No user names in anything sent to the LLM or stored in rationale —
  `grep -n "users.name" services/opportunity/*.ts` → no matches
- [ ] Admin curation mutations + audit rows working

## STOP conditions

- You need a new embeddings vendor — ask first (Step 1 gate).
- Scoring output quality is unusable after 2 prompt iterations — stop; ship
  Step 6 curation-only and report (this is the contingency, not a failure).
- `opportunity.approve` semantics conflict with recompute (e.g. approval
  mid-recompute) — report rather than adding locks ad hoc.

## Maintenance notes

- The SOW fast-follow (LLM-drafted, replacing the hardcoded `priceUsd: 68_000`
  in `lib/sow.ts:28`) should consume `dimensionScores` + rationale from here.
- Plan 020 schedules recompute; keep `recompute(sprintId)` callable standalone.
- Reviewer: the privacy boundary (roles not names into prompts) and approved-row
  immutability are the two things to scrutinize.
