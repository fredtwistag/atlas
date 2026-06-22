# Per-Opportunity Workflow Diagrams — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move workflow diagrams from a standalone sprint-level report section into each surfaced opportunity (a current-state slice built from that opportunity's evidence, with the eliminated step flagged red); keep the Impact vs. Effort matrix at report level.

**Architecture:** Reuse the existing engine pointed at one opportunity's evidence. New `chooseOpportunityKind` + `generateOpportunityDiagram` (engine), a new `buildOpportunityWorkflows` recompute pass persisting one `workflow_maps` row per surfaced opp (`opportunity_id` set, `surfaced`), a `loadOpportunityWorkflow` read + `opportunity.workflow` tRPC, and a "Workflow" tab in the opportunity detail. Sprint-level synthesis is slimmed to the matrix only.

**Tech Stack:** TypeScript, Drizzle + RLS, tRPC, React server/client components, vitest (+ jsdom, embedded-postgres). Anthropic via `@/services/llm/client`.

**Spec:** `docs/superpowers/specs/2026-06-22-per-opportunity-workflow-diagrams-design.md`. Builds on the workflow-maps engine + `WorkflowDiagram` already on main. The generation fixes (maxTokens 8192, `relevantKindsFor`) are already committed (`d89a9ec`).

**Note:** `workflow_maps.opportunity_id` already exists — **no migration**. The recompute currently persists sprint maps as `provisional` (never visible without a curation UI that was never built); this plan persists the matrix + per-opp diagrams as **`surfaced`** so they're actually shown (the human-curation gate returns if/when a curation UI is built).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `services/synthesis/workflows/opportunity-diagram.ts` (+test) | `chooseOpportunityKind` + `generateOpportunityDiagram` | Create |
| `services/synthesis/workflows/generate.ts` | `generateGraph` gains optional `context` param | Modify |
| `services/synthesis/workflows/synthesize.ts` (+test) | slim to matrix-only | Modify |
| `services/opportunity/recompute.ts` | matrix→surfaced; new `buildOpportunityWorkflows` + wiring | Modify |
| `lib/sprint-read.ts` | `loadOpportunityWorkflow` read | Modify |
| `server/trpc/routers/opportunity.ts` | `opportunity.workflow` query | Modify |
| `components/opportunity/OpportunityDetail.tsx` | "Workflow" tab | Modify |
| `app/(app)/sprint/[id]/opportunity/[oppId]/page.tsx` | fetch + pass `workflow` | Modify |
| `app/(app)/admin/clients/[tenantId]/sprint/[sprintId]/opportunity/[oppId]/page.tsx` | pass `workflow` (Twistag read-only) | Modify |
| `components/report/ReportArticle.tsx` | rename diagram block to "Impact vs. effort" | Modify |

No barrels. Co-locate tests. Commit ONLY named files per task (never `git add -A`/`.` — unrelated WIP in the tree). Commands: unit/component `npx vitest run <path>`; integration `npx vitest run -c vitest.integration.config.ts <path>`; typecheck `npx tsc --noEmit`.

---

## Task 1: `chooseOpportunityKind` (pure)

**Files:**
- Create: `services/synthesis/workflows/opportunity-diagram.ts`
- Create: `services/synthesis/workflows/opportunity-diagram.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { chooseOpportunityKind } from "./opportunity-diagram";
import type { WorkflowCapture } from "./types";

const cap = (kind: string): WorkflowCapture => ({
  id: "x", kind, summary: "s", role: "Ops", department: null, contributorId: "u",
});

describe("chooseOpportunityKind", () => {
  it("picks systems_topology when tooling/workaround outnumber process kinds", () => {
    expect(chooseOpportunityKind([cap("tooling"), cap("tooling"), cap("workaround"), cap("handoff")])).toBe("systems_topology");
  });
  it("picks swimlane when process kinds dominate", () => {
    expect(chooseOpportunityKind([cap("bottleneck"), cap("handoff"), cap("sop"), cap("tooling")])).toBe("swimlane");
  });
  it("defaults to swimlane on a tie or empty", () => {
    expect(chooseOpportunityKind([cap("tooling"), cap("bottleneck")])).toBe("swimlane");
    expect(chooseOpportunityKind([])).toBe("swimlane");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run services/synthesis/workflows/opportunity-diagram.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `opportunity-diagram.ts` (the function only for now)**

```typescript
import type { WorkflowCapture } from "./types";

/**
 * Pick the diagram kind that fits an opportunity's evidence: systems topology
 * when tooling/integration captures dominate, otherwise a process swimlane.
 * Ties and empty input default to swimlane.
 */
export function chooseOpportunityKind(
  captures: WorkflowCapture[],
): "swimlane" | "systems_topology" {
  let systemish = 0;
  let processish = 0;
  for (const c of captures) {
    if (c.kind === "tooling" || c.kind === "workaround") systemish++;
    if (c.kind === "handoff" || c.kind === "sop" || c.kind === "decision" || c.kind === "bottleneck") processish++;
  }
  return systemish > processish ? "systems_topology" : "swimlane";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run services/synthesis/workflows/opportunity-diagram.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add services/synthesis/workflows/opportunity-diagram.ts services/synthesis/workflows/opportunity-diagram.test.ts
git commit -m "feat(workflows): chooseOpportunityKind — pick diagram shape per opportunity"
```

---

## Task 2: `generateGraph` context parameter

**Files:**
- Modify: `services/synthesis/workflows/generate.ts`
- Modify: `services/synthesis/workflows/generate.test.ts`

- [ ] **Step 1: Add the failing test (append to `generate.test.ts`)**

```typescript
describe("generateGraph context", () => {
  it("includes the opportunity title in the prompt when context is given", async () => {
    completeStructured.mockResolvedValue({ kind: "swimlane", title: "t", lanes: [], steps: [], edges: [] });
    await generateGraph("swimlane", [cap({})], ["Sales rep"], { opportunityTitle: "Automate CPCV generation" });
    const content = completeStructured.mock.calls[0][0].messages[0].content as string;
    expect(content).toContain("Automate CPCV generation");
    expect(content.toLowerCase()).toContain("bottleneck");
  });
});
```

> `cap` and the `completeStructured` mock already exist in this file from the earlier tests.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run services/synthesis/workflows/generate.test.ts`
Expected: FAIL (context arg ignored — title not in prompt).

- [ ] **Step 3: Add the optional `context` param to `generateGraph`**

Change the signature and the user-message assembly in `services/synthesis/workflows/generate.ts`:

```typescript
export async function generateGraph(
  kind: WorkflowKind,
  captures: WorkflowCapture[],
  roleLabels: string[],
  context?: { opportunityTitle: string },
): Promise<WorkflowGraphDraft | null> {
  const config = KIND_PROMPTS[kind];
  if (!config) throw new Error(`No prompt config for workflow kind: ${kind}`);

  const relevant = captures.filter((c) => config.relevantKinds.has(c.kind));
  if (relevant.length === 0) return null;

  const userLines = ["Build the workflow graph from these captures.", ""];
  if (context) {
    userLines.push(
      `CONTEXT: this is the current-state workflow behind a specific improvement — "${context.opportunityTitle}". Draw only the slice relevant to it, and mark the single step or seam it removes as a bottleneck (stepKind 'bottleneck') or gap (edgeKind 'gap').`,
      "",
    );
  }
  userLines.push("CAPTURES (id [kind] (role) summary):", captureLines(relevant));

  const draft = await completeStructured({
    system: config.system(roleLabels),
    schema: workflowGraphDraft,
    maxTokens: 8192,
    messages: [{ role: "user", content: userLines.join("\n") }],
  });

  return { ...draft, kind };
}
```

- [ ] **Step 4: Run to verify it passes + typecheck**

Run: `npx vitest run services/synthesis/workflows/generate.test.ts && npx tsc --noEmit`
Expected: PASS (5 tests now), tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add services/synthesis/workflows/generate.ts services/synthesis/workflows/generate.test.ts
git commit -m "feat(workflows): generateGraph accepts per-opportunity context"
```

---

## Task 3: `generateOpportunityDiagram` orchestrator

**Files:**
- Modify: `services/synthesis/workflows/opportunity-diagram.ts`
- Modify: `services/synthesis/workflows/opportunity-diagram.test.ts`

- [ ] **Step 1: Add the failing test (append to `opportunity-diagram.test.ts`)**

```typescript
import { vi, beforeEach } from "vitest";

const generateGraph = vi.fn();
vi.mock("./generate", async () => {
  const actual = await vi.importActual<typeof import("./generate")>("./generate");
  return { ...actual, generateGraph: (...a: unknown[]) => generateGraph(...a) };
});

import { generateOpportunityDiagram } from "./opportunity-diagram";

const C1 = "11111111-1111-4111-8111-111111111111";
const C2 = "22222222-2222-4222-8222-222222222222";
const ev = (id: string, contributorId: string): WorkflowCapture => ({ id, kind: "bottleneck", summary: "manual step", role: "Ops", department: null, contributorId });

beforeEach(() => generateGraph.mockReset());

describe("generateOpportunityDiagram", () => {
  it("returns a confidence-scored graph for a grounded opportunity diagram", async () => {
    generateGraph.mockResolvedValue({
      kind: "swimlane", title: "Current state", lanes: [],
      steps: [
        { id: "s1", label: "Log deal", laneId: null, stepKind: "step", inferred: false, captureIds: [C1], metric: null },
        { id: "s2", label: "Re-key", laneId: null, stepKind: "bottleneck", inferred: false, captureIds: [C2], metric: null },
      ],
      edges: [{ id: "e1", from: "s1", to: "s2", edgeKind: "flow", label: null, inferred: false, captureIds: [C1, C2] }],
    });
    const out = await generateOpportunityDiagram({ title: "Automate re-keying" }, [ev(C1, "u1"), ev(C2, "u2")], ["Ops"], "m");
    expect(out).not.toBeNull();
    expect(out!.confidence.score).toBeGreaterThanOrEqual(0.3);
    expect(out!.modelVersion).toBe("m");
  });
  it("returns null when generation throws", async () => {
    generateGraph.mockRejectedValue(new Error("LLM down"));
    expect(await generateOpportunityDiagram({ title: "x" }, [ev(C1, "u1")], [], "m")).toBeNull();
  });
  it("returns null when validation leaves it under the minimum", async () => {
    generateGraph.mockResolvedValue({ kind: "swimlane", title: "t", lanes: [], steps: [{ id: "s1", label: "ghost", laneId: null, stepKind: "step", inferred: false, captureIds: ["bad"], metric: null }], edges: [] });
    expect(await generateOpportunityDiagram({ title: "x" }, [ev(C1, "u1")], [], "m")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run services/synthesis/workflows/opportunity-diagram.test.ts`
Expected: FAIL (`generateOpportunityDiagram` not exported).

- [ ] **Step 3: Add `generateOpportunityDiagram` to `opportunity-diagram.ts`**

Add imports + the function (keep `chooseOpportunityKind` above it):

```typescript
import { generateGraph, relevantKindsFor } from "./generate";
import { validateGraph } from "./validate";
import { scoreConfidence } from "./confidence";
import type { WorkflowGraph } from "./types";

const MIN_STEPS = 2;
const MIN_CONFIDENCE = 0.3; // same bar as sprint-level; coverage is scoped to the opp's relevant captures

/**
 * Build one current-state diagram for a single opportunity from its evidence.
 * Chooses the kind, generates with the opportunity as context, validates,
 * confidence-gates (coverage scoped to the kind's relevant captures), and
 * returns the graph or null (abstain). No critic pass — the input is the
 * opportunity's already-scored evidence; validate + the gate are enough.
 */
export async function generateOpportunityDiagram(
  opp: { title: string },
  captures: WorkflowCapture[],
  roleLabels: string[],
  modelVersion: string,
): Promise<WorkflowGraph | null> {
  const kind = chooseOpportunityKind(captures);
  let draft;
  try {
    draft = await generateGraph(kind, captures, roleLabels, { opportunityTitle: opp.title });
  } catch {
    return null;
  }
  if (!draft) return null;

  const known = new Set(captures.map((c) => c.id));
  const cleaned = validateGraph(draft, known);
  if (cleaned.steps.length < MIN_STEPS) return null;

  const relevant = captures.filter((c) => relevantKindsFor(kind).has(c.kind));
  const scored = scoreConfidence(cleaned, relevant.length > 0 ? relevant : captures);
  if (scored.score < MIN_CONFIDENCE) return null;

  return { ...cleaned, confidence: { ...scored, disputedStepIds: [] }, modelVersion };
}
```

- [ ] **Step 4: Run to verify it passes + typecheck**

Run: `npx vitest run services/synthesis/workflows/opportunity-diagram.test.ts && npx tsc --noEmit`
Expected: PASS (6 tests), tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add services/synthesis/workflows/opportunity-diagram.ts services/synthesis/workflows/opportunity-diagram.test.ts
git commit -m "feat(workflows): generateOpportunityDiagram — per-opp current-state diagram"
```

---

## Task 4: Slim `synthesizeWorkflows` to the matrix

**Files:**
- Modify: `services/synthesis/workflows/synthesize.ts`
- Modify: `services/synthesis/workflows/synthesize.test.ts`

- [ ] **Step 1: Replace `synthesize.test.ts` with the matrix-only contract**

```typescript
import { describe, it, expect } from "vitest";
import { synthesizeWorkflows } from "./synthesize";
import type { OpportunityPoint, WorkflowCapture } from "./types";

const opp = (id: string): OpportunityPoint => ({ id, title: id, impactHigh: 1, timeToShipWeeksHigh: 1, horizon: "standard" });
const caps: WorkflowCapture[] = [];

describe("synthesizeWorkflows (sprint-level)", () => {
  it("emits only the impact_effort matrix when there are >=3 opportunities", async () => {
    const out = await synthesizeWorkflows({ captures: caps, opportunities: [opp("a"), opp("b"), opp("c")], roleLabels: [], modelVersion: "m" });
    expect(out.map((g) => g.kind)).toEqual(["impact_effort"]);
  });
  it("emits nothing with fewer than 3 opportunities", async () => {
    const out = await synthesizeWorkflows({ captures: caps, opportunities: [opp("a")], roleLabels: [], modelVersion: "m" });
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run services/synthesis/workflows/synthesize.test.ts`
Expected: FAIL (current synthesize still tries swimlane/topology paths / mocks).

- [ ] **Step 3: Rewrite `synthesize.ts` to matrix-only**

Replace the whole file:

```typescript
import { captureStats, routeKinds } from "./stats";
import { buildImpactEffort } from "./impact-effort";
import type { OpportunityPoint, WorkflowCapture, WorkflowGraph } from "./types";

export interface SynthesizeInput {
  captures: WorkflowCapture[];
  opportunities: OpportunityPoint[];
  roleLabels: string[];
  modelVersion: string;
}

/**
 * Sprint-level synthesis. Process/systems diagrams now live per-opportunity
 * (see opportunity-diagram.ts); at sprint level we emit only the pure-TS
 * impact/effort matrix.
 */
export async function synthesizeWorkflows(
  input: SynthesizeInput,
): Promise<WorkflowGraph[]> {
  const stats = captureStats(input.captures);
  const kinds = routeKinds(stats, input.opportunities.length);
  const out: WorkflowGraph[] = [];
  if (kinds.includes("impact_effort")) {
    out.push(buildImpactEffort(input.opportunities));
  }
  return out;
}
```

> This drops the swimlane/topology loop, the critic, and the `generate`/`validate`/`confidence` imports from this file. `routeKinds`/`stats` are kept for the `impact_effort` eligibility decision.

- [ ] **Step 4: Run to verify it passes + typecheck**

Run: `npx vitest run services/synthesis/workflows/synthesize.test.ts && npx tsc --noEmit`
Expected: PASS (2 tests), tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add services/synthesis/workflows/synthesize.ts services/synthesis/workflows/synthesize.test.ts
git commit -m "refactor(workflows): sprint-level synthesis emits only the impact/effort matrix"
```

---

## Task 5: Recompute — matrix surfaced + `buildOpportunityWorkflows`

**Files:**
- Modify: `services/opportunity/recompute.ts`

- [ ] **Step 1: Imports + make the matrix surfaced**

In `services/opportunity/recompute.ts`, add `isNotNull` to the `drizzle-orm` import (alongside `and`, `eq`), and add:

```typescript
import { generateOpportunityDiagram } from "@/services/synthesis/workflows/opportunity-diagram";
```

In `buildWorkflowMaps`, change the replace + insert so the matrix is **surfaced** and scoped to sprint-level (opportunity_id null):

```typescript
  // Replace the sprint-level map (the matrix); surfaced so the report shows it.
  await tx
    .delete(workflowMaps)
    .where(and(eq(workflowMaps.sprintId, opts.sprintId), isNull(workflowMaps.opportunityId)));

  for (const graph of graphs) {
    await tx.insert(workflowMaps).values({
      tenantId: opts.tenantId,
      sprintId: opts.sprintId,
      kind: graph.kind,
      graph,
      status: "surfaced",
      opportunityId: null,
    });
  }
```

(`isNull` is already imported in this file for other reads; if not, add it to the `drizzle-orm` import.)

- [ ] **Step 2: Add `buildOpportunityWorkflows`**

Add next to `buildWorkflowMaps`:

```typescript
/**
 * Generate + persist one current-state diagram per SURFACED opportunity, from
 * that opportunity's own evidence captures (surfaced). Idempotent: replaces all
 * opportunity-scoped maps for the sprint. Best-effort per opportunity.
 */
async function buildOpportunityWorkflows(
  tx: Db,
  opts: {
    tenantId: string;
    sprintId: string;
    opps: { id: string; title: string; captureIds: string[] }[];
    capturesById: Map<string, WorkflowCapture>;
    roleLabels: string[];
    modelVersion: string;
  },
): Promise<void> {
  await tx
    .delete(workflowMaps)
    .where(and(eq(workflowMaps.sprintId, opts.sprintId), isNotNull(workflowMaps.opportunityId)));

  for (const opp of opts.opps) {
    const caps = opp.captureIds
      .map((id) => opts.capturesById.get(id))
      .filter((c): c is WorkflowCapture => c !== undefined);
    if (caps.length === 0) continue;

    let graph;
    try {
      graph = await generateOpportunityDiagram({ title: opp.title }, caps, opts.roleLabels, opts.modelVersion);
    } catch {
      continue; // best-effort
    }
    if (!graph) continue;

    await tx.insert(workflowMaps).values({
      tenantId: opts.tenantId,
      sprintId: opts.sprintId,
      kind: graph.kind,
      graph,
      status: "surfaced",
      opportunityId: opp.id,
    });
  }
}
```

- [ ] **Step 3: Wire it after `buildWorkflowMaps`**

Right after the `await buildWorkflowMaps(tx, { ... })` call, add the per-opp pass. Reuse the `captureRows` → `WorkflowCapture` mapping as a lookup, and the surfaced candidates:

```typescript
  // --- per-opportunity workflow diagrams ------------------------------------
  const wfCapturesById = new Map<string, WorkflowCapture>(
    captureRows.map((c) => [
      c.id,
      {
        id: c.id,
        kind: c.kind,
        summary: c.summary,
        role: c.role ?? "",
        department: c.department ?? null,
        contributorId: c.userId,
      },
    ]),
  );
  await buildOpportunityWorkflows(tx, {
    tenantId,
    sprintId,
    opps: finalCandidates
      .filter((c) => surfacedKeys.has(c.key) && idByKey.has(c.key))
      .map((c) => ({ id: idByKey.get(c.key)!, title: c.title, captureIds: c.evidenceCaptureIds })),
    capturesById: wfCapturesById,
    roleLabels: [
      ...new Set(captureRows.map((c) => c.role).filter((r): r is string => Boolean(r))),
    ],
    modelVersion: `${process.env.ATLAS_LLM_MODEL ?? "claude-sonnet-4-6"}:wf-v1`,
  });
```

- [ ] **Step 4: Typecheck + no regression on the recompute integration test**

Run: `npx tsc --noEmit && npx vitest run -c vitest.integration.config.ts db/opportunity-recompute.integration.test.ts db/workflow-maps.integration.test.ts`
Expected: tsc exit 0; existing recompute + workflow-maps integration tests pass (the recompute test mocks/uses no LLM for opp diagrams — `generateOpportunityDiagram` best-effort-returns on no LLM, leaving opp maps empty, which is fine for that test; confirm it still green).

> If `db/opportunity-recompute.integration.test.ts` exercises the real LLM and now slows/fails on the per-opp loop, the per-opp loop is best-effort (a thrown LLM call is caught per opp), so it should not fail the test — only add latency. If it adds meaningful latency, that's expected; do not weaken the loop.

- [ ] **Step 5: Commit**

```bash
git add services/opportunity/recompute.ts
git commit -m "feat(recompute): surfaced matrix + per-opportunity diagrams"
```

---

## Task 6: `loadOpportunityWorkflow` read + tRPC

**Files:**
- Modify: `lib/sprint-read.ts`
- Modify: `server/trpc/routers/opportunity.ts`
- Modify: `db/workflow-maps.integration.test.ts`

- [ ] **Step 1: Add the failing integration test (append to `db/workflow-maps.integration.test.ts`)**

```typescript
import { loadOpportunityWorkflow } from "@/lib/sprint-read";
// add `opportunities` + (already present) users/captures to the schema import

describe("loadOpportunityWorkflow", () => {
  const OPP = "00000000-0000-0000-0000-0000000007f1";
  it("returns the surfaced per-opportunity diagram with name+role evidence", async () => {
    await seedRow((tx) =>
      tx.insert(opportunities).values({
        id: OPP, tenantId: TENANT_A, sprintId: SPRINT_A, title: "Automate re-keying", description: "d", category: "Ops",
        impactLow: 1, impactHigh: 2, timeToShipWeeksLow: 1, timeToShipWeeksHigh: 2, confidenceScore: 4,
        compositeScore: "6.0", dimensionScores: [], rationale: "r", status: "surfaced",
      }),
    );
    await seedRow((tx) =>
      tx.insert(workflowMaps).values({
        tenantId: TENANT_A, sprintId: SPRINT_A, kind: "swimlane", status: "surfaced", opportunityId: OPP,
        graph: { ...sampleGraph, title: "Current state" },
      }),
    );
    const view = await asUser({ tenantId: TENANT_A }, (tx) => loadOpportunityWorkflow(tx, OPP));
    expect(view).not.toBeNull();
    expect(view!.title).toBe("Current state");
  });
  it("returns null when the opportunity has no surfaced diagram", async () => {
    const view = await asUser({ tenantId: TENANT_A }, (tx) => loadOpportunityWorkflow(tx, "00000000-0000-0000-0000-0000000007f2"));
    expect(view).toBeNull();
  });
});
```

> Match `opportunities` NOT NULL columns to `db/schema.ts` (the foundation reference lists them). `sampleGraph` is defined at the top of this test file.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run -c vitest.integration.config.ts db/workflow-maps.integration.test.ts`
Expected: FAIL (`loadOpportunityWorkflow` not exported).

- [ ] **Step 3: Add `loadOpportunityWorkflow` to `lib/sprint-read.ts`**

Mirror `loadWorkflowMaps` (resolve evidence to name+role), but match a single opportunity's map:

```typescript
/**
 * The current-state workflow diagram for one opportunity, or null. Under a
 * tenant context RLS returns it only when surfaced. Evidence resolved to
 * name + role (de-anonymized 2026-06-20); removed captures excluded.
 */
export async function loadOpportunityWorkflow(
  tx: Db,
  opportunityId: string,
): Promise<WorkflowMapView | null> {
  const [row] = await tx
    .select({ id: workflowMaps.id, kind: workflowMaps.kind, graph: workflowMaps.graph })
    .from(workflowMaps)
    .where(eq(workflowMaps.opportunityId, opportunityId))
    .limit(1);
  if (!row) return null;

  const g = row.graph as WorkflowGraph;
  const ids = new Set<string>();
  for (const s of g.steps) for (const id of s.captureIds) ids.add(id);
  for (const e of g.edges) for (const id of e.captureIds) ids.add(id);

  const evRows = ids.size
    ? await tx
        .select({
          id: captures.id, kind: captures.kind, summary: captures.summary,
          sourceQuote: captures.sourceQuote, sessionId: captures.sessionId,
          tags: captures.tags, isEdited: captures.isEdited, isRemoved: captures.isRemoved,
          name: users.name, role: users.title,
        })
        .from(captures)
        .innerJoin(users, eq(captures.userId, users.id))
        .where(and(inArray(captures.id, [...ids]), eq(captures.isRemoved, false)))
    : [];

  const evidence: Capture[] = [];
  const seen = new Set<string>();
  const sessions = new Set<string>();
  for (const e of evRows) {
    if (e.sessionId) sessions.add(e.sessionId);
    const key = e.sourceQuote.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    evidence.push({
      id: e.id, kind: e.kind as Capture["kind"], summary: e.summary, sourceQuote: e.sourceQuote,
      contributorName: e.name, contributorRole: e.role ?? "Contributor", sessionId: e.sessionId,
      tags: e.tags, isEdited: e.isEdited, isRemoved: e.isRemoved,
    });
  }

  return {
    id: row.id,
    kind: g.kind,
    title: g.title,
    graph: g,
    confidence: g.confidence,
    basedOnSessions: sessions.size,
    evidence,
  };
}
```

(`WorkflowMapView`, `WorkflowGraph`, `workflowMaps`, `inArray` are already imported in this file from the Plan 2 work; if any is missing, add it.)

- [ ] **Step 4: Add the tRPC query to `server/trpc/routers/opportunity.ts`**

Add `loadOpportunityWorkflow` to the `@/lib/sprint-read` import and a procedure next to `get`:

```typescript
  workflow: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) =>
      withTenantContext(ctx.session, (tx) => loadOpportunityWorkflow(tx, input.id)),
    ),
```

- [ ] **Step 5: Run + typecheck**

Run: `npx vitest run -c vitest.integration.config.ts db/workflow-maps.integration.test.ts && npx tsc --noEmit`
Expected: PASS; tsc exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/sprint-read.ts server/trpc/routers/opportunity.ts db/workflow-maps.integration.test.ts
git commit -m "feat(opportunity): loadOpportunityWorkflow + workflow query"
```

---

## Task 7: "Workflow" tab + report rename

**Files:**
- Modify: `components/opportunity/OpportunityDetail.tsx`
- Modify: `app/(app)/sprint/[id]/opportunity/[oppId]/page.tsx`
- Modify: `app/(app)/admin/clients/[tenantId]/sprint/[sprintId]/opportunity/[oppId]/page.tsx`
- Modify: `components/report/ReportArticle.tsx`

- [ ] **Step 1: Add the `workflow` prop + "Workflow" tab to `OpportunityDetail.tsx`**

Add imports:
```typescript
import { WorkflowDiagram } from "@/components/workflow/WorkflowDiagram";
import type { WorkflowMapView } from "@/services/synthesis/workflows/types";
```

Widen the `Tab` type and add the prop:
```typescript
type Tab = "evidence" | "workflow" | "patterns" | "discussion";
```
```typescript
  workflow,
```
```typescript
  /** This opportunity's current-state diagram, when one was surfaced. */
  workflow?: WorkflowMapView | null;
```

Make the tab list dynamic (only show Workflow when present). Replace the hardcoded `tabKeys` and the inline `[Tab, string][]` array:
```typescript
  const tabKeys: Tab[] = workflow
    ? ["evidence", "workflow", "patterns", "discussion"]
    : ["evidence", "patterns", "discussion"];
```
```typescript
            {(
              [
                ["evidence", `Evidence · ${opp.evidence.length}`],
                ...(workflow ? ([["workflow", "Workflow"]] as [Tab, string][]) : []),
                ["patterns", "Patterns"],
                ["discussion", "Discussion"],
              ] as [Tab, string][]
            ).map(([key, label], idx) => {
```

Add the panel next to the `{tab === "evidence" && (…)}` block:
```typescript
          {tab === "workflow" && workflow && (
            <div role="tabpanel" id={panelId("workflow")} aria-labelledby={tabId("workflow")} tabIndex={0}>
              <p className="mb-3 text-[13px] text-text-3">
                Current state, synthesized from this opportunity&apos;s evidence. The highlighted step is what it removes.
              </p>
              <div className="not-prose overflow-x-auto rounded-lg border border-border bg-surface p-3">
                <WorkflowDiagram graph={workflow.graph} instanceId={workflow.id} />
              </div>
            </div>
          )}
```

- [ ] **Step 2: Fetch + pass `workflow` from the tenant opportunity page**

In `app/(app)/sprint/[id]/opportunity/[oppId]/page.tsx`, extend the fetch and pass the prop:
```typescript
  const [opp, sprint, workflow] = await Promise.all([
    api.opportunity.get({ id: oppId }).catch(() => null),
    api.sprint.get({ id }).catch(() => null),
    api.opportunity.workflow({ id: oppId }).catch(() => null),
  ]);
  if (!opp) notFound();
```
Add `workflow={workflow}` to the `<OpportunityDetail .../>` props.

- [ ] **Step 3: Pass `workflow` from the Twistag admin opportunity page**

In `app/(app)/admin/clients/[tenantId]/sprint/[sprintId]/opportunity/[oppId]/page.tsx`, fetch the opportunity's workflow via the twistag caller (it loads the opp read-only). Add `api.opportunity.workflow({ id: oppId }).catch(() => null)` (or the twistag equivalent if opportunity reads there go through a twistag procedure) and pass `workflow={workflow}` to `<OpportunityDetail>`. If the admin view loads opportunities through a `twistag.*` procedure rather than `opportunity.*`, mirror that: add a `workflow` field to that loader using `loadOpportunityWorkflow` under `withTwistagContext`. Confirm the actual call chain in this file before wiring.

> If wiring the admin view cleanly is non-trivial, pass `workflow={null}` here (the tab simply won't show for the read-only admin view) and note it — the tenant view is the priority.

- [ ] **Step 4: Rename the report diagram block to "Impact vs. effort"**

In `components/report/ReportArticle.tsx`, the workflow-maps `<Section>` now only ever receives the matrix (sprint-level synthesis is matrix-only). Rename its title from `"How the work flows today"` to `"Impact vs. effort"` and replace the intro paragraph with one line describing the matrix (e.g. "Every surfaced opportunity placed by estimated impact against effort to ship."). Leave the rendering loop as-is (it renders the single matrix map + its numbered legend).

- [ ] **Step 5: Typecheck + component/report suites**

Run: `npx tsc --noEmit && npx vitest run components/opportunity components/report`
Expected: tsc exit 0; existing component tests pass (the OpportunityDetail tests should still pass — the new prop is optional).

- [ ] **Step 6: Verify in the browser (controller does this)**

The implementer SKIPS browser verification. The controller will run the Vizta recompute and confirm each surfaced opportunity's detail page shows a "Workflow" tab with its diagram, and the report shows only the matrix.

- [ ] **Step 7: Commit**

```bash
git add components/opportunity/OpportunityDetail.tsx "app/(app)/sprint/[id]/opportunity/[oppId]/page.tsx" "app/(app)/admin/clients/[tenantId]/sprint/[sprintId]/opportunity/[oppId]/page.tsx" components/report/ReportArticle.tsx
git commit -m "feat(opportunity): Workflow tab; report shows only the impact/effort matrix"
```

---

## Self-Review (completed during planning)

**Spec coverage:** §5.1 report→matrix (Task 4 slim + Task 7 rename); §5.2 per-opp engine (Tasks 1–3) + recompute pass (Task 5); §5.3 reuse `workflow_maps.opportunity_id`, no migration (Tasks 5–6); §5.4 Workflow tab + read + tRPC (Tasks 6–7); §5.5 generation fixes already committed (`d89a9ec`). Auto-surface decision (no curation UI) reflected in Task 5.

**Placeholder scan:** none. The two "confirm the actual call chain / pass null" notes (Task 7 Step 3) are guarded fallbacks with a concrete default, not vague directives.

**Type consistency:** `chooseOpportunityKind`/`generateOpportunityDiagram` signatures match across Tasks 1/3/5. `generateGraph`'s new `context?: { opportunityTitle }` matches Tasks 2/3. `WorkflowMapView` (read) consumed by Tasks 6/7. `workflow_maps` rows: matrix = `opportunity_id NULL` surfaced (Task 5 buildWorkflowMaps); per-opp = `opportunity_id` set surfaced (Task 5 buildOpportunityWorkflows); read by `opportunity_id` (Task 6) and `isNull(opportunity_id)` for the report (existing `loadWorkflowMaps`, unchanged) — no overlap.
