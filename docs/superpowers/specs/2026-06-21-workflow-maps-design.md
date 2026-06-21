# Workflow Maps — Design Spec

**Date:** 2026-06-21
**Status:** Approved design, ready for implementation plan
**Author:** Fred (brainstormed with Claude)

---

## 1. Summary

Atlas already captures *how work actually happens* as typed `captures`
(`handoff`, `sop`, `decision`, `bottleneck`, `workaround`, `frustration`,
`tooling`). Today those captures are clustered into opportunities, a systems
inventory, a stakeholder map, and a memo — all **text**. This feature adds a
**visual layer**: diagrams synthesized from the same captures that show a
client's current-state workflows, the systems behind them, and — for the
opportunities that ship — a **before/after** of the process being improved.

The product bet: a swimlane process map or an impact/effort matrix is the
deliverable a PE/operations buyer recognizes from a real diagnostic. It also
turns evidence from a list into a picture: every step and handoff traces back to
named captures, so the diagram is *defensible*, not "the AI's opinion."

The hard constraint, and the thing this design is built around: **a
confidently-wrong diagram is worse than no diagram.** A fabricated handoff gets
spotted by the one person who owns that process, and credibility is gone. So the
engine's first job is to **never assert what the evidence doesn't support, and to
know when to stay silent.**

## 2. Goals

1. Synthesize **current-state workflow diagrams** (1–3 per sprint) from captures,
   scoped as cross-contributor process maps (not one person's transcript).
2. Show a **before/after** workflow diagram on each *portfolio* opportunity.
3. Render diagrams as a **family** sharing one pipeline, with an MVP set of
   renderers and a path to add more without re-architecting.
4. Make the generation engine **robust, scalable, and trustworthy** — grounded in
   evidence, with abstention and human curation as first-class outcomes.
5. Reuse Atlas's existing synthesis/curation/RLS patterns; no new infrastructure.

## 3. Non-goals (this milestone)

- Value-stream timeline overlay (value-add vs. wait time). Deferred — depends on
  time estimates that are too soft to show under the "calibrated to reality"
  voice rule. Layer in once time inference is trustworthy.
- Auto-surfacing diagrams to clients without human review (see §9 — MVP is
  always human-curated).
- Free-form diagram editing / a full graph editor. MVP curation is light.
- Voice, Slack/Teams, real-time collaboration on diagrams — out of Wave 1.
- Building all six fast-follow renderers now (schema supports them; only the MVP
  set ships — see §6).

## 4. Scope decisions (resolved in brainstorming)

| Decision | Choice |
|---|---|
| What a workflow maps to | **B + D**: synthesized cross-contributor process maps in the report **and** before/after on opportunities. |
| Notation ambition | **Option 3**: swimlanes + handoffs in MVP; value-stream timeline deferred. |
| MVP renderer set | **C**: swimlane process map + opportunity before/after, **systems topology**, **impact/effort 2×2**. |
| Diagram family | Schema is an extensible `kind` discriminator; all six fast-follows are designed in, built when warranted. |
| Surfacing default | **Always human-curated** before a client sees any diagram (MVP). Loosen to confidence-gated auto-surface later. |

## 5. Architecture overview

```
captures (typed, role+dept, no names)
        │
        ▼
[ENGINE]  route → generate (grounded) → validate/drop → critic → confidence → gate
        │
        ▼
workflow_maps (tenant-scoped, RLS, status: provisional|surfaced|hidden)
   graph: { kind, lanes[], steps[], edges[] }  (semantic, captureIds on every element)
        │
        ├── Twistag admin curates (verify each step vs. source quote)
        │
        ▼
deterministic renderer family (TS → SVG)  ── shared layout + evidence resolution
        │
        ├── report: "How the work flows today" + systems topology + impact/effort 2×2
        └── opportunity detail: before/after pair
```

Key separation of concerns, mirroring existing synthesis services:

- **The LLM emits *semantic structure only*** — lanes, steps, edges, each citing
  `captureIds`. Never names, never raw quotes, never pixel coordinates.
- **Deterministic TS does layout** — the same graph always renders identically
  (snapshot-testable, no drift).
- **Evidence is resolved at read time** in `lib/sprint-read.ts`, attaching
  contributor **name + role** (de-anon is allowed in the sponsor UI, per
  CLAUDE.md 2026-06-20).

## 6. Diagram type family

Every diagram is a `kind` over a shared semantic-graph schema. Each kind has an
**eligibility signature** — a deterministic rule over capture statistics that
decides whether there's enough signal to draw it at all (§8.1).

### MVP renderers (build now)

| kind | What it shows | Fed by | Eligibility signature |
|---|---|---|---|
| `swimlane` | Cross-functional process; lanes = roles, cross-lane arrows = handoffs | `handoff`, `sop`, `decision`, `bottleneck`, `workaround` | ≥ 3 sequential steps spanning ≥ 2 distinct roles, ≥ 1 handoff |
| `before_after` | A portfolio opportunity's current vs. future state | the opportunity's evidence ∩ a `swimlane` map | opportunity is in the portfolio AND overlaps a surfaced workflow |
| `systems_topology` | Tools as nodes, integration gaps as broken edges | `tooling`, `workaround`, `integration_gap` (the systems inventory) | ≥ 2 systems with ≥ 1 inter-system edge |
| `impact_effort` | Opportunities plotted by impact vs. effort (pure TS, **no LLM**) | `impactLow/High`, `timeToShipWeeks`, `horizon` | ≥ 3 scored opportunities |

### Fast-follow renderers (schema-ready, build when warranted)

| kind | What it reveals | Fed by |
|---|---|---|
| `decision_flow` | Branching/gated processes ("if refund > $500, escalate") | `decision` captures with branch conditions |
| `handoff_network` | The team that's a coordination chokepoint | `handoff` captures, aggregated |
| `rework_loop` | Draft→review→reject→redo waste (rendered as a stepper, not a ring) | `bottleneck`/`frustration` mentioning redo |
| `journey_map` | Customer-facing flow with a pain/emotion row | `frustration` captures |
| `raci_grid` | Steps with no clear owner, or double-accountability | handoff/decision + roles |
| `sipoc_strip` | One-row scoping band above a workflow | the workflow's own steps |

## 7. Data model

### 7.1 Semantic graph (the `graph` JSONB payload)

```ts
type WorkflowKind =
  | "swimlane" | "before_after" | "systems_topology" | "impact_effort"
  | "decision_flow" | "handoff_network" | "rework_loop"
  | "journey_map" | "raci_grid" | "sipoc_strip";

interface WorkflowGraph {
  kind: WorkflowKind;
  title: string;                 // plain words, no marketing language
  lanes: { id: string; roleLabel: string; department: string | null }[];
  steps: {
    id: string;
    label: string;
    laneId: string | null;       // null for non-laned kinds (topology, matrix)
    stepKind: "step" | "decision" | "system" | "shadow_tool" | "gap" | "start" | "end";
    inferred: boolean;           // true = model-added connective tissue, rendered ghosted
    captureIds: string[];        // [] only allowed when inferred === true
  }[];
  edges: {
    id: string;
    from: string;                // step id
    to: string;                  // step id
    edgeKind: "flow" | "handoff" | "gap";
    label: string | null;        // short branch label e.g. "Yes"/"No"; else null
    inferred: boolean;
    captureIds: string[];
  }[];
  confidence: {
    score: number;               // 0–1, computed (§8.5), NOT model self-report
    coverage: number;            // captures mapped / relevant captures
    corroboratedCount: number;   // elements backed by ≥ 2 contributors
    disputedStepIds: string[];   // contributors described these differently
  };
  modelVersion: string;          // model id + prompt version, for audit/re-run
}
```

**Validation invariants** (enforced by a deterministic validator, not the LLM):

- Every `captureId` resolves to a real input capture id (mirrors
  `clusterSystems` in `services/synthesis/systems.ts`).
- A step/edge with `captureIds.length === 0` is **only** allowed when
  `inferred === true`; otherwise it is dropped.
- Every edge's `from`/`to` references an existing step id.
- Every step's `laneId` (when non-null) references an existing lane.
- Lane `roleLabel`/`department` must come from the sprint's participant roles —
  the model cannot invent an org.
- For `impact_effort`, the graph is built in pure TS from opportunity scores; no
  LLM call, so `inferred` is always false and `confidence.score` is 1.

### 7.2 Storage

One table, graph as JSONB — matching the `synthesis_memo` (jsonb on sprint)
precedent rather than the normalized `system_inventory_items` + evidence-join
precedent, because a workflow is an inherently nested graph curated and rendered
as a unit.

```
workflow_maps
  id            uuid pk
  tenant_id     uuid not null
  sprint_id     uuid not null
  kind          text not null
  graph         jsonb not null         -- WorkflowGraph
  status        text not null          -- 'provisional' | 'surfaced' | 'hidden'
  opportunity_id uuid null             -- set for kind='before_after'
  created_at    timestamptz
  updated_at    timestamptz
```

**RLS** mirrors `system_inventory_items` (migrations 0014–0016):

- `tenant_id` + `sprint_id` columns; SELECT policy for authenticated
  (`tenant_id = jwt tenant_id`) + Twistag read.
- **All writes go through `service_role` only** (no tenant INSERT/UPDATE policy);
  generation runs inside the Inngest/recompute path, audited.
- Adversarial cross-tenant test required (read another tenant's row → 0 rows),
  per the multi-tenancy rule.
- PR touching RLS policies needs 2 engineer approvals.

Evidence is **not** a separate join table; `captureIds` live inside the graph and
are resolved against `captures` at read time in `lib/sprint-read.ts`.

## 8. The engine

Core principle: **every visual element traces to evidence; anything that can't be
grounded is dropped, marked inferred, or the diagram abstains.**

### 8.1 Route by evidence (deterministic)

The engine does *not* ask the model "what should I draw?" It computes capture
statistics and applies the eligibility signatures in §6. A kind with
insufficient signal is **never generated**. First false-positive defense: the
engine can't draw a process it didn't hear about.

### 8.2 Generate a grounded graph (LLM)

One `completeStructured` call per eligible kind (see `services/llm/client.ts`),
output validated against a Zod schema added to `services/llm/schemas.ts`. Input
to the LLM is **capture `id + kind + summary` plus contributor `role + department`
only** — never names, never raw quotes — identical to the systems/stakeholder
boundary. The model emits the semantic graph with `captureIds` on every element.

### 8.3 Validate & drop (deterministic)

Apply the §7.1 invariants. Ungrounded, non-inferred elements are removed.
Structurally broken edges/lanes are removed. This is the guard that kills a
hallucinated step carrying a fabricated citation.

### 8.4 Critic pass (LLM)

A second, independent pass with adversarial framing: *"find every step or edge
that overstates what its cited captures actually say."* Low-support elements are
auto-dropped or flagged for the curator. One bounded pass per diagram.

### 8.5 Confidence (computed, not self-reported)

`confidence.score` is derived from grounding facts, never the model's opinion:

- **Coverage** — relevant captures mapped vs. orphaned.
- **Corroboration** — elements backed by **≥ 2 contributors** (a handoff named by
  *both* giver and receiver is high-signal) vs. a single voice.
- **Conflict** — when contributors describe a step differently, it goes to
  `disputedStepIds` and renders as **"disputed,"** never silently resolved.
- **Dangling structure** — an output with no consumer becomes an explicit "not
  captured" node, not a fabricated next step.

### 8.6 Gate / abstention (first-class)

Below threshold, the diagram is **held** — a calibrated empty state ("Not enough
signal yet to map this workflow — needs ~2 more sessions"), per the voice rules.
Silence beats a wrong map. Above threshold, the diagram is written as
`provisional`.

### 8.7 Human curation before the client sees it (MVP default)

Diagrams never reach a client as `surfaced` without Twistag approval. The
curation UI shows each step's source quote on click so the curator verifies
against evidence. This is the credibility backstop while the confidence score
earns a track record. (Post-MVP: confidence-gated auto-surface, mirroring how
opportunities surface at day ≥ 7, confidence ≥ 3.)

### 8.8 Determinism, scale, audit

- LLM emits structure; TS does layout → identical renders, snapshot-testable.
- Generation is **batch at synthesis time**, cached in `workflow_maps`; reads are
  free SVG-from-JSON. Cost scales with sprints, not users.
- Idempotent regeneration (delete + insert) for `provisional` rows; **curated /
  `surfaced` rows are not clobbered** by a recompute (mirrors the frozen-approved
  handling in `recompute.ts`).
- Each graph stores `modelVersion` for audit and clean re-runs.

## 9. Rendering

A renderer family under `components/workflow/`:

- `layout/` — pure functions: `WorkflowGraph` → positioned primitives (boxes,
  lanes, edges, diamonds). One layout module per structural shape (laned flow,
  topology, matrix). Unit + snapshot tested; **no React, no I/O**.
- `WorkflowDiagram.tsx` — server component that takes a graph + resolved evidence
  and emits the SVG, dispatching on `kind`.
- **Honesty primitives** baked into the renderer: `inferred` elements render
  dashed/ghosted with a "not directly observed" note; `disputedStepIds` get a
  "disputed" marker; evidence-count badges ("3 people" vs "1 person"); explicit
  "not captured" nodes; a confidence label + "based on N sessions" on the diagram.

The renderer is shared by the report, the opportunity before/after, and the
admin curation preview — write it once.

## 10. Integration points (existing code)

| Concern | Where |
|---|---|
| Synthesis orchestration | `services/opportunity/recompute.ts` — add `buildWorkflowMaps(tx, …)` alongside `buildSystemsInventory` (~L455) / `buildStakeholderMap` (~L477) |
| New synthesis service | `services/synthesis/workflows.ts` (twin of `services/synthesis/systems.ts`) |
| LLM client + schemas | `services/llm/client.ts` (`completeStructured`), `services/llm/schemas.ts` (add `workflowGraph` Zod schema) |
| DB schema + migration | `db/schema.ts` (add `workflow_maps`), new migration with RLS (pattern: migrations 0014–0016) |
| Read for report/detail | `lib/sprint-read.ts` (add `loadWorkflowMaps`, resolve evidence to name+role; sibling of `loadSystemsInventory` ~L464) |
| Report rendering | `components/report/ReportArticle.tsx` — new "How the work flows today" section; also finally surface the systems inventory |
| Report page data | `app/(app)/sprint/[id]/report/page.tsx` |
| Opportunity before/after | opportunity detail page/component (`components/opportunity/OpportunityDetail.tsx`) |
| Twistag curation | new `WorkflowCurationCard` (twin of `components/admin/OpportunityCurationCard.tsx`); procedures in `server/trpc/routers/twistag.ts` (`workflow.setStatus`, `workflow.update`, service_role, audited) |
| Recompute triggers | `twistag.opportunityRecompute` tRPC + Inngest job (plan 020) already exist |

## 11. Privacy & security

- LLM synthesis boundary receives **role + department + capture summary only** —
  never names, emails, `userId`, or raw transcript quotes. Same guarantee
  `systems.ts` / `stakeholders.ts` already uphold.
- Evidence resolution to **name + role** happens only at read time, in the
  tenant-scoped read path, for the manager/sponsor UI (allowed per CLAUDE.md
  2026-06-20). Never email/`userId`.
- All writes via `service_role` inside audited workers; RLS SELECT for tenant +
  Twistag read; adversarial cross-tenant test mandatory.
- Do not log graph payloads containing capture summaries to general app logs.

## 12. Build order

1. `workflow_maps` schema + migration + RLS + adversarial cross-tenant test.
2. `workflowGraph` Zod schema in `services/llm/schemas.ts`.
3. `services/synthesis/workflows.ts`: routing (8.1), generation (8.2), validation
   (8.3), confidence (8.5) — with unit tests on the validator/confidence (no LLM).
4. Critic pass (8.4).
5. Renderer family in `components/workflow/` (layout + `WorkflowDiagram`) — snapshot
   tests, starting with `swimlane`, `systems_topology`, `impact_effort`.
6. Wire `buildWorkflowMaps` into `recompute.ts` (idempotent, don't clobber curated).
7. `loadWorkflowMaps` in `lib/sprint-read.ts` (evidence → name+role).
8. Report section in `ReportArticle.tsx` (+ surface systems inventory).
9. `before_after` generation + render on portfolio opportunities.
10. `WorkflowCurationCard` + Twistag procedures + audit.

## 13. Testing strategy

- **Validator & confidence: pure unit tests** (no LLM) — fabricated/ungrounded
  elements dropped, disputed steps flagged, abstention triggers below threshold.
- **Renderer: snapshot tests** — fixed graph → fixed SVG; assert honesty
  primitives render (ghosted inferred, disputed markers, evidence badges).
- **RLS: adversarial integration test** — another tenant reads 0 rows
  (embedded-postgres harness).
- **Engine integration**: golden capture fixtures → expected eligibility outcome
  (drawn vs. held) and expected node/edge count after validation.
- **Privacy assertion**: the LLM input builder never includes `name`/`email`/
  `userId` (test the boundary, as the capture join does in `recompute.ts`).

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Hallucinated steps/handoffs damage credibility | Grounded generation + validate/drop + critic pass + observed-vs-inferred rendering + human curation gate. |
| Time/effort numbers feel invented | Defer value-stream timeline; impact/effort 2×2 uses only already-computed scores. |
| One person's view presented as canonical | Corroboration scoring; single-voice elements lower confidence; disputed marker. |
| Recompute clobbers curated diagrams | Idempotent regen for `provisional` only; curated/`surfaced` rows preserved. |
| Layout drift / flaky visuals | LLM emits structure, TS does layout; snapshot tests. |
| Cost at scale | Batch generation at synthesis, cached; reads are free. |

## 15. Open questions

- Confidence thresholds (eligibility minimums, abstain cutoff) are placeholders
  to calibrate against real sprint data — start conservative, tune after the
  first pilots.
- Whether `before_after` future-state is generated for *all* portfolio
  opportunities or only `approved` ones — lean to portfolio-wide, revisit if LLM
  cost is material.
