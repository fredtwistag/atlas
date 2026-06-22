# Per-Opportunity Workflow Diagrams — Design Spec

**Date:** 2026-06-22
**Status:** Approved design, ready for implementation plan
**Author:** Fred (brainstormed with Claude)

---

## 1. Summary

The workflow-diagram engine currently produces **sprint-level** process maps (one swimlane "how the work flows", one systems topology) rendered as a standalone report section. In practice these read as abstract and low-value — a sprint-wide map doesn't answer the question a sponsor actually has: *what does this specific opportunity change?*

This refactor moves the process/systems diagrams **out of the report and into each opportunity**, where they have context: each surfaced opportunity gets a small **current-state diagram built from its own evidence**, with the bottleneck/handoff/gap it eliminates flagged. The **Impact vs. Effort matrix stays at the report level** (it's a portfolio overview, not a process map).

Net effect: the report gets lighter, and every diagram now has a clear job — "here's the messy flow this opportunity fixes."

## 2. Goals

1. Each **surfaced** opportunity shows one focused, grounded current-state diagram in its detail view.
2. The diagram is built from **that opportunity's evidence captures only** — small, contextual, no sprint-wide sprawl.
3. The step/handoff/gap the opportunity removes is visibly flagged (red) — **using the existing tone mapping, no new highlight mechanism**.
4. Keep the **Impact vs. Effort matrix** at report level; remove the standalone swimlane + topology report section.
5. Reuse the existing engine, table, and renderer — minimal new surface, **no DB migration**.

## 3. Non-goals

- A speculative "after"/future-state diagram (option B from brainstorming was rejected — the "after" is where the over-promise / "shoot in the foot" risk lives). We show **current state with the change highlighted (option C)**.
- Diagrams for hidden/provisional opportunities — **surfaced only**.
- On-the-fly generation — diagrams are generated at **recompute** and cached.
- Keeping the sprint-level swimlane/topology anywhere — they are removed.

## 4. Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| What each opportunity diagram shows | **C — current-state slice with the eliminated step/gap flagged** (no future-state) |
| Which opportunities | **Surfaced only** |
| Diagram kind | **Chosen per opportunity** from its evidence (process → swimlane, tooling/gap → systems topology) |
| Generation timing | **At recompute**, cached on the opportunity row |
| Report-level | **Impact vs. Effort matrix stays**; swimlane + topology removed |
| UI placement | New **"Workflow"** tab in the opportunity detail |
| The "highlight" | Automatic — the opportunity's bottleneck/gap capture becomes a `bottleneck`/`gap` element, which `WorkflowDiagram` already renders red |

## 5. Design

### 5.1 Report — matrix only

The report's "How the work flows today" block currently renders every surfaced sprint-level map. After this change, the engine produces **only `impact_effort`** at sprint level, so the block naturally renders just the matrix. Rename the block to **"Impact vs. effort"** (it's no longer "how the work flows"). `loadWorkflowMaps` already filters to `isNull(opportunity_id)`, so no read change is needed — it returns only the matrix.

### 5.2 Engine — per-opportunity generation

In `recompute` (`services/opportunity/recompute.ts`):

- **Sprint level:** keep generating only the `impact_effort` matrix (drop the swimlane + topology sprint-level generation from the current `buildWorkflowMaps`).
- **Per opportunity (new `buildOpportunityWorkflows`):** for each **surfaced** opportunity:
  1. Resolve its evidence captures (`opportunity_evidence` → `captures` → `users`) into `WorkflowCapture[]` (role + department + server-only contributorId; **never names to the LLM**, same boundary as today). The recompute already has `captureRows` and each candidate's `evidenceCaptureIds` — filter to build the per-opp set.
  2. **Choose the kind** (`chooseOpportunityKind(captures)`): `systems_topology` when tooling/workaround capture kinds dominate the opp's evidence; otherwise `swimlane`. (Pure, testable.)
  3. `generateGraph(kind, oppCaptures, roleLabels, { opportunityTitle })` — same generator, with a short **context line** appended to the prompt: *"This is the current-state workflow behind the improvement 'X'. Show only the slice relevant to it, and mark the step/gap it removes as a bottleneck/gap."* This both focuses the diagram and guarantees the red flag.
  4. `validateGraph` → confidence gate (`scoreConfidence` scoped to the opp's relevant captures). Abstain (skip) if under-supported — an opportunity with no diagram just shows the empty state.
  5. Persist as a `workflow_maps` row: `kind`, `graph`, `status: 'surfaced'`, **`opportunity_id` set**.
- **Critic pass:** skipped for the per-opp path. The input is the opportunity's already-scored evidence (a small, curated set), so the separate adversarial LLM call isn't worth the per-opp cost; `validateGraph` (drops ungrounded elements) + the confidence gate remain. (Documented tradeoff.)
- **Idempotent:** before regenerating, delete the sprint's existing per-opp maps (`opportunity_id IS NOT NULL`) — mirrors the existing provisional-delete pattern.
- **Best-effort:** a failing/abstaining opp never sinks recompute (try/catch per opp), same as today.

`generateGraph` gains one optional param: `context?: { opportunityTitle: string }`. When present, the user message gets the context line. The sprint-level `synthesizeWorkflows` is simplified to emit only the matrix.

### 5.3 Data — reuse `workflow_maps`, no migration

`workflow_maps` already has a nullable `opportunity_id` column (added in the foundation slice for a never-built before/after). Per-opp diagrams are rows with `opportunity_id` set; the matrix is the row with it null. RLS (tenant sees `surfaced`, Twistag sees all) and the renderer are unchanged.

### 5.4 Opportunity detail — "Workflow" tab

- New read `loadOpportunityWorkflow(tx, opportunityId)` in `lib/sprint-read.ts` — returns the `WorkflowMapView` for `workflow_maps WHERE opportunity_id = $id` (RLS surfaced-only under tenant context), with evidence resolved to name+role, or `null`.
- New tRPC query `opportunity.workflow` (tenant-gated, `withTenantContext`).
- The opportunity page (`app/(app)/sprint/[id]/opportunity/[oppId]/page.tsx`) fetches it and passes a `workflow` prop to `OpportunityDetail`.
- `OpportunityDetail` (`components/opportunity/OpportunityDetail.tsx`) adds a **"Workflow"** tab to the existing tab list (`evidence` / `patterns` / `discussion`). The tab renders the `WorkflowDiagram` + a one-line caption ("Current state — the highlighted step is what this opportunity removes"). Empty state when `workflow` is null (engine abstained). The tab is shown only when `workflow` is present (keep the tab list dynamic, like the array it already builds).
- The Twistag read-only admin opportunity view also renders `OpportunityDetail`; pass `workflow` there too (its page fetches via the twistag context).

### 5.5 Engine fixes already applied (commit with this work)

Two calibration fixes were applied while testing on real Vizta data and are currently uncommitted — they are prerequisites and ship with this work:
- `generateGraph` `maxTokens` 3072 → 8192 (the 3072 budget truncated rich swimlane JSON).
- `scoreConfidence` coverage scoped to the **kind's relevant captures** via `relevantKindsFor()` (a focused diagram was unfairly gated against the whole sprint's captures). These especially matter for per-opp diagrams.

## 6. Integration points (existing code)

| Concern | Where |
|---|---|
| Recompute orchestration | `services/opportunity/recompute.ts` — `buildWorkflowMaps` (slim to matrix) + new `buildOpportunityWorkflows` |
| Per-opp kind choice | new `chooseOpportunityKind` (in `services/synthesis/workflows/`) |
| Generation | `services/synthesis/workflows/generate.ts` — `generateGraph` gains optional `context` |
| Validate / confidence | `services/synthesis/workflows/{validate,confidence}.ts` (+ the `relevantKindsFor` fix) |
| Sprint-level orchestrator | `services/synthesis/workflows/synthesize.ts` — emit matrix only |
| Table | `db/schema.ts` `workflow_maps` (has `opportunity_id`) — no migration |
| Opp evidence link | `opportunity_evidence` table; `recompute` candidate `evidenceCaptureIds` |
| Read | `lib/sprint-read.ts` — new `loadOpportunityWorkflow`; `loadWorkflowMaps` unchanged (matrix only) |
| tRPC | `server/trpc/routers/opportunity.ts` — new `workflow` query |
| Report | `components/report/ReportArticle.tsx` — rename block to "Impact vs. effort", renders the matrix |
| Opp UI | `components/opportunity/OpportunityDetail.tsx` (Workflow tab); `app/(app)/sprint/[id]/opportunity/[oppId]/page.tsx`; the Twistag admin opp page |
| Renderer | `components/workflow/WorkflowDiagram.tsx` — unchanged (swimlane/topology already render; bottleneck/gap already red) |

## 7. Testing

- **`chooseOpportunityKind`** — pure unit tests (tooling-dominant → topology; process-dominant → swimlane; tie → swimlane).
- **`buildOpportunityWorkflows`** — with a mocked LLM: persists one row per surfaced opp with `opportunity_id` set; skips abstained opps; best-effort (one failure doesn't sink the batch); idempotent re-run.
- **`loadOpportunityWorkflow`** — integration (embedded-postgres): returns the surfaced per-opp map with name+role evidence; RLS (other tenant → null/0); a provisional per-opp map is hidden from tenant.
- **Report** — `loadWorkflowMaps` returns only the matrix (no swimlane/topology) once sprint-level generation is matrix-only.
- **`OpportunityDetail`** — the Workflow tab renders the diagram when `workflow` present; hidden/empty when null; existing tabs unaffected.
- **Privacy** — the per-opp generation prompt builder never includes contributorId/name (assert, as the existing generate test does).

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| LLM cost: ~1 call per surfaced opp per recompute (17 for Vizta) | Surfaced-only; critic pass skipped per-opp; batch + best-effort; cached until next recompute. |
| A per-opp diagram is thin / abstains | Empty state in the tab; surfaced opps with rich evidence (the ones that matter) will have enough. |
| Over-promise via diagram | Current-state only (option C); no speculative "after"; every element grounded in the opp's evidence (validateGraph drops the rest). |
| Removing sprint maps loses the "systems topology" overview | Accepted — it was low-value standalone; systems gaps now show inside the relevant opportunity. |
| Stale sprint-level swimlane/topology rows already in the DB (from testing) | Cleared by the idempotent regeneration on the next recompute. |

## 9. Open questions

- **Report block placement** — keep the matrix as its own "Impact vs. effort" block, or move it to the head of "Opportunities, ranked"? Default: its own block; revisit during implementation.
- **`chooseOpportunityKind` threshold** — start with "topology if tooling+workaround strictly outnumber process kinds, else swimlane"; tune if it mis-picks on real opps.
- **Per-opp confidence floor** — reuse the existing `MIN_CONFIDENCE` (0.3, now fairer with the coverage fix); revisit if good opp diagrams abstain.
