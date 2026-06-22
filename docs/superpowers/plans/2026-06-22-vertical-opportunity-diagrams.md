# Vertical Per-Opportunity Workflow Diagrams — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Render each opportunity's workflow diagram as a **vertical stack of full-width cards** instead of a cramped horizontal row. Each card = a role chip + the full step title (no 20-char truncation) + a description line drawn from the step's evidence. Bottlenecks stay red, inferred steps dashed.

**Why:** Horizontal swimlane gives each box ~130px → titles truncate ("re-enter q…") and there's no room for detail. Vertical gives the full width: complete labels + a grounded description line (the quantified pain straight from the contributor).

**Design decisions (settled via mockup review with Fred, 2026-06-22):**
- Layout: vertical full-width cards, one column, role chip per card (handoffs read as the chip changing).
- Description line: **from evidence** — the summary of the capture each step cites. No LLM/schema-prompt change, no recompute. Deduped so a repeated citation doesn't repeat down the column; inferred steps (no evidence) show "inferred".
- Scope: **swimlane only** (every surfaced Vizta per-opp diagram is a swimlane). `systems_topology` and the report `impact_effort` matrix are unchanged. No engine, generation, or recompute changes.

**Tech:** React 19 SVG renderer, TypeScript, vitest (+ jsdom, embedded-postgres), Drizzle.

---

## File Structure

| File | Change |
|---|---|
| `services/llm/schemas.ts` | `workflowStep` gains optional `detail` (render-enriched; LLM never sets it) |
| `components/workflow/layout/types.ts` | `LayoutBox` gains `chip?: string \| null` |
| `lib/sprint-read.ts` | `loadOpportunityWorkflow` attaches per-step `detail` from evidence (deduped) |
| `components/workflow/layout/shared.ts` (+test) | add `routeEdgeVertical` |
| `components/workflow/layout/swimlane.ts` (+test) | rewrite to vertical card layout |
| `components/workflow/WorkflowDiagram.tsx` (+test) | `Box` renders the vertical card (chip + wide title + subtitle) when `box.chip` is set |

No barrels. Co-locate tests. Commit ONLY named files per task (never `git add -A`/`.` — unrelated WIP/`gtm-strategy/` in the tree). Unit/component: `npx vitest run <path>`; integration: `npx vitest run -c vitest.integration.config.ts <path>`; typecheck `npx tsc --noEmit`.

---

## Task 1: Schema `detail` field + `LayoutBox.chip`

**Files:** `services/llm/schemas.ts`, `components/workflow/layout/types.ts`

- [ ] **Step 1: Add `detail` to `workflowStep`**

In `services/llm/schemas.ts`, inside `workflowStep` (after the `metric` field):

```typescript
  // Set only for kind = 'impact_effort' (effort=x, impact=y). LLM leaves null.
  metric: z
    .object({ x: z.number(), y: z.number() })
    .nullable()
    .default(null),
  // Render-only: a one-line description attached at read time from the step's
  // evidence (see loadOpportunityWorkflow). The LLM never sets this — it's not
  // in any generation prompt; the read layer always overwrites it.
  detail: z.string().nullable().optional(),
```

- [ ] **Step 2: Add `chip` to `LayoutBox`**

In `components/workflow/layout/types.ts`, add to the `LayoutBox` interface:

```typescript
  dashed: boolean;
  /** Role label shown as a pill at the top of a vertical card. When set, the
   * renderer draws the card (left-aligned chip + title + subtitle) instead of
   * the centered box. null/undefined → the existing centered rendering. */
  chip?: string | null;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` → exit 0. (No behavior change yet; existing layouts leave `chip` undefined.)

- [ ] **Step 4: Commit**

```bash
git add services/llm/schemas.ts components/workflow/layout/types.ts
git commit -m "feat(workflow): step detail field + LayoutBox chip for vertical cards"
```

---

## Task 2: Read enrichment — per-step `detail` from evidence

**Files:** `lib/sprint-read.ts`, `db/workflow-maps.integration.test.ts`

- [ ] **Step 1: Add the failing integration test** (append to `db/workflow-maps.integration.test.ts`, in the `loadOpportunityWorkflow` describe block or a new one)

Seed an opportunity + a surfaced swimlane `workflow_maps` row whose steps cite captures, then assert detail is attached + deduped + null for inferred. Reuse the file's existing `seedRow`/`asUser`/`TENANT_A`/`SPRINT_A` helpers and the `captures`/`users` seeding already present.

```typescript
it("attaches a deduped evidence description to each step", async () => {
  const OPP = "00000000-0000-0000-0000-0000000007f3";
  const CAP_A = "<an existing seeded capture id with a known summary>";
  await seedRow((tx) => tx.insert(opportunities).values({ /* …NOT NULL cols…, */ id: OPP, tenantId: TENANT_A, sprintId: SPRINT_A, status: "surfaced" }));
  await seedRow((tx) => tx.insert(workflowMaps).values({
    tenantId: TENANT_A, sprintId: SPRINT_A, kind: "swimlane", status: "surfaced", opportunityId: OPP,
    graph: {
      kind: "swimlane", title: "t",
      lanes: [{ id: "L1", roleLabel: "Ops", department: null }],
      steps: [
        { id: "s1", label: "Start", laneId: "L1", stepKind: "start", inferred: true, captureIds: [], metric: null },
        { id: "s2", label: "Reconcile", laneId: "L1", stepKind: "bottleneck", inferred: false, captureIds: [CAP_A], metric: null },
        { id: "s3", label: "Re-enter", laneId: "L1", stepKind: "bottleneck", inferred: false, captureIds: [CAP_A], metric: null },
      ],
      edges: [],
      confidence: { score: 0.6, coverage: 0.6, corroboratedCount: 1, disputedStepIds: [] },
      modelVersion: "test",
    },
  }));
  const view = await asUser({ tenantId: TENANT_A }, (tx) => loadOpportunityWorkflow(tx, OPP));
  const byId = new Map(view!.graph.steps.map((s) => [s.id, s.detail]));
  expect(byId.get("s1")).toBeNull();                 // inferred → no description
  expect(byId.get("s2")).toBeTruthy();               // first cite → the summary
  expect(byId.get("s3")).toBeNull();                 // same capture as s2 → deduped
});
```

> Pick `CAP_A` from a capture already seeded in this file (it resolves to a known `summary`). Match the `opportunities` NOT NULL columns to `db/schema.ts` (as the existing `loadOpportunityWorkflow` test does).

- [ ] **Step 2: Run → confirm FAIL** (`s.detail` is undefined today).

`npx vitest run -c vitest.integration.config.ts db/workflow-maps.integration.test.ts`

- [ ] **Step 3: Enrich in `loadOpportunityWorkflow`**

In `lib/sprint-read.ts`, after the `evidence`/`sessions` loop is built (just before the `return`), add — using `evRows` which already carry `id` + `summary`:

```typescript
  // Render-only enrichment: give each step a one-line description from its
  // primary evidence. Dedupe so a repeated citation doesn't echo down the
  // column, and never repeat the step's own label. Inferred steps stay null.
  const summaryById = new Map(evRows.map((e) => [e.id, e.summary] as const));
  const norm = (x: string) => x.toLowerCase().replace(/\s+/g, " ").trim();
  let prevDetail = "";
  for (const s of g.steps) {
    let detail: string | null = null;
    if (!s.inferred) {
      for (const cid of s.captureIds) {
        const sum = summaryById.get(cid);
        if (sum) { detail = sum; break; }
      }
    }
    if (detail && (norm(detail) === norm(s.label) || norm(detail) === prevDetail)) {
      detail = null;
    }
    s.detail = detail;
    if (detail) prevDetail = norm(detail);
  }
```

(`g.steps` are mutable plain objects from the JSONB; `detail` is now in the type from Task 1.)

- [ ] **Step 4: Run → confirm PASS + tsc**

`npx vitest run -c vitest.integration.config.ts db/workflow-maps.integration.test.ts && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add lib/sprint-read.ts db/workflow-maps.integration.test.ts
git commit -m "feat(opportunity): attach deduped evidence description to each workflow step"
```

---

## Task 3: Vertical swimlane layout

**Files:** `components/workflow/layout/shared.ts`, `components/workflow/layout/shared.test.ts`, `components/workflow/layout/swimlane.ts`, `components/workflow/layout/swimlane.test.ts`

- [ ] **Step 1: Add `routeEdgeVertical` + its failing test**

Append to `shared.test.ts`:

```typescript
import { routeEdgeVertical } from "./shared";
const mk = (y: number) => ({ id: "x", x: 110, y, w: 460, h: 74, title: "", subtitle: null, tone: "blue" as const, shape: "rect" as const, dashed: false });

describe("routeEdgeVertical", () => {
  it("draws a straight connector between adjacent stacked cards", () => {
    const pts = routeEdgeVertical(mk(20), mk(116), 22); // 116 = 20+74+22
    expect(pts).toHaveLength(2);
    expect(pts[0].x).toBe(pts[1].x); // same centre x
  });
  it("routes a skip/back edge around the side", () => {
    const pts = routeEdgeVertical(mk(20), mk(300), 22);
    expect(pts.length).toBeGreaterThan(2);
  });
});
```

Then add to `shared.ts`:

```typescript
/** Vertical connector from a's bottom-centre to b's top-centre. Straight when
 * b is the next card down; otherwise routes around the right side (skip/back edges). */
export function routeEdgeVertical(
  a: LayoutBox,
  b: LayoutBox,
  gap: number,
): { x: number; y: number }[] {
  const start = { x: a.x + a.w / 2, y: a.y + a.h };
  const end = { x: b.x + b.w / 2, y: b.y - 8 };
  const adjacent = end.y > start.y && end.y - start.y <= gap + 12;
  if (adjacent && Math.abs(start.x - end.x) < 1) return [start, end];
  const sideX = Math.max(a.x + a.w, b.x + b.w) + 24;
  const y1 = start.y + 8;
  const y2 = end.y - 8;
  return [start, { x: start.x, y: y1 }, { x: sideX, y: y1 }, { x: sideX, y: y2 }, { x: end.x, y: y2 }, end];
}
```

- [ ] **Step 2: Replace `swimlane.test.ts` with the vertical contract**

```typescript
import { describe, it, expect } from "vitest";
import { layoutSwimlane } from "./swimlane";
import type { WorkflowGraph } from "@/services/synthesis/workflows/types";

const graph = {
  kind: "swimlane", title: "t",
  lanes: [{ id: "L1", roleLabel: "Comercial", department: null }, { id: "L2", roleLabel: "Financeira", department: null }],
  steps: [
    { id: "s1", label: "Draft CPCV document in Word", laneId: "L1", stepKind: "start", inferred: true, captureIds: [], metric: null, detail: null },
    { id: "s2", label: "Reconcile conflicting versions", laneId: "L1", stepKind: "bottleneck", inferred: false, captureIds: [], metric: null, detail: "Merges edits from many email threads" },
    { id: "s3", label: "Review and mark up clauses", laneId: "L2", stepKind: "step", inferred: false, captureIds: [], metric: null, detail: "Returns a revised Word file" },
  ],
  edges: [{ id: "e1", from: "s1", to: "s2", edgeKind: "flow", label: null, inferred: false, captureIds: [] }, { id: "e2", from: "s2", to: "s3", edgeKind: "flow", label: null, inferred: false, captureIds: [] }],
  confidence: { score: 1, coverage: 1, corroboratedCount: 0, disputedStepIds: [] }, modelVersion: "t",
} as unknown as WorkflowGraph;

describe("layoutSwimlane (vertical cards)", () => {
  const l = layoutSwimlane(graph);
  it("stacks full-width cards in one column", () => {
    expect(l.lanes).toHaveLength(0);                       // no horizontal bands
    const xs = new Set(l.boxes.map((b) => b.x));
    expect(xs.size).toBe(1);                               // single column
    const ys = l.boxes.map((b) => b.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));     // increasing y
    expect(l.boxes[0].w).toBeGreaterThan(400);             // wide
  });
  it("sets the role chip + subtitle per card", () => {
    const s2 = l.boxes.find((b) => b.id === "s2")!;
    expect(s2.chip).toBe("Comercial");
    expect(s2.subtitle).toBe("Merges edits from many email threads");
    expect(s2.tone).toBe("red");                           // bottleneck
    const s1 = l.boxes.find((b) => b.id === "s1")!;
    expect(s1.subtitle).toBe("inferred");
    expect(s1.dashed).toBe(true);
  });
  it("produces one edge per graph edge", () => {
    expect(l.edges).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run → confirm FAIL**, then rewrite `swimlane.ts`:

```typescript
import type { WorkflowGraph } from "@/services/synthesis/workflows/types";
import type { Layout, LayoutBox, LayoutEdge } from "./types";
import { assignColumns, routeEdgeVertical, stepTone } from "./shared";

const WIDTH = 680;
const CARD_W = 460;
const CARD_H = 74;
const CARD_X = (WIDTH - CARD_W) / 2; // 110
const GAP = 22;
const TOP = 20;

/** Vertical card stack: one column of full-width cards, role chip per card, the
 * step's evidence description as the subtitle. Lanes are not drawn as bands —
 * the chip carries the role, so handoffs read as the chip changing. */
export function layoutSwimlane(graph: WorkflowGraph): Layout {
  const laneLabel = new Map(graph.lanes.map((l) => [l.id, l.roleLabel]));
  const col = assignColumns(graph.steps.map((s) => s.id), graph.edges);
  const ordered = [...graph.steps].sort(
    (a, b) => (col.get(a.id) as number) - (col.get(b.id) as number),
  );

  const boxes: LayoutBox[] = [];
  const boxById = new Map<string, LayoutBox>();
  let y = TOP;
  for (const step of ordered) {
    const box: LayoutBox = {
      id: step.id,
      x: CARD_X,
      y,
      w: CARD_W,
      h: CARD_H,
      title: step.label,
      subtitle: step.inferred ? "inferred" : (step.detail ?? null),
      chip: laneLabel.get(step.laneId ?? "") ?? null,
      tone: stepTone(step),
      shape: "rect",
      dashed: step.inferred,
    };
    boxes.push(box);
    boxById.set(step.id, box);
    y += CARD_H + GAP;
  }

  const edges: LayoutEdge[] = [];
  for (const e of graph.edges) {
    const a = boxById.get(e.from);
    const b = boxById.get(e.to);
    if (!a || !b) continue;
    edges.push({
      id: e.id,
      points: routeEdgeVertical(a, b, GAP),
      dashed: e.inferred || e.edgeKind === "gap",
      tone: e.edgeKind === "gap" ? "red" : "gray",
    });
  }

  return {
    width: WIDTH,
    height: Math.max(TOP + 40, y - GAP + 24),
    lanes: [],
    boxes,
    edges,
    lines: [],
    texts: [],
  };
}
```

> Drops `stepShape` (no diamonds in card mode) and the horizontal constants. `assignColumns` is reused only to order the steps.

- [ ] **Step 4: Run both suites + tsc**

`npx vitest run components/workflow/layout && npx tsc --noEmit` → green, exit 0.

- [ ] **Step 5: Commit**

```bash
git add components/workflow/layout/shared.ts components/workflow/layout/shared.test.ts components/workflow/layout/swimlane.ts components/workflow/layout/swimlane.test.ts
git commit -m "feat(workflow): vertical card layout for swimlane diagrams"
```

---

## Task 4: Renderer — vertical card

**Files:** `components/workflow/WorkflowDiagram.tsx`, `components/workflow/WorkflowDiagram.test.tsx` (create if absent)

- [ ] **Step 1: Add the failing component test**

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { WorkflowDiagram } from "./WorkflowDiagram";
import type { WorkflowGraph } from "@/services/synthesis/workflows/types";

const graph = {
  kind: "swimlane", title: "Current state",
  lanes: [{ id: "L1", roleLabel: "Diretora Financeira", department: null }],
  steps: [
    { id: "s1", label: "Manually match transfers to contracts in full", laneId: "L1", stepKind: "bottleneck", inferred: false, captureIds: [], metric: null, detail: "About one full week per month for two people" },
  ],
  edges: [],
  confidence: { score: 1, coverage: 1, corroboratedCount: 0, disputedStepIds: [] }, modelVersion: "t",
} as unknown as WorkflowGraph;

describe("WorkflowDiagram vertical card", () => {
  it("renders the role chip, the full (untruncated) title, and the description", () => {
    const { container } = render(<WorkflowDiagram graph={graph} instanceId="t" />);
    const text = container.textContent ?? "";
    expect(text).toContain("Diretora Financeira");                       // chip
    expect(text).toContain("Manually match transfers to contracts");     // title not cut at 20 chars
    expect(text).toContain("About one full week per month");             // description
  });
});
```

> If jsdom + RTL aren't already wired for `components/`, mirror the setup used by `components/opportunity/OpportunityDetail.test.tsx` (same vitest env).

- [ ] **Step 2: Run → confirm FAIL** (title truncates at 20 chars; no chip).

- [ ] **Step 3: Render the vertical card in `Box`**

In `components/workflow/WorkflowDiagram.tsx`, at the top of the `Box` component (before the existing centered return), add the card branch:

```tsx
function Box({ box }: { box: LayoutBox }) {
  const c = TONE[box.tone];
  const dash = box.dashed ? "4 3" : undefined;

  // Vertical card: role chip + left-aligned title + evidence description.
  if (box.chip != null) {
    const pad = 16;
    const chipW = Math.min(box.w - 2 * pad, box.chip.length * 6.4 + 18);
    return (
      <g>
        <title>{box.subtitle ? `${box.title} — ${box.subtitle}` : box.title}</title>
        <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={10} fill={c.fill} stroke={c.stroke} strokeWidth={1} strokeDasharray={dash} />
        <rect x={box.x + pad} y={box.y + 12} width={chipW} height={18} rx={9} fill="var(--surface)" stroke="var(--border)" strokeWidth={0.5} />
        <text x={box.x + pad + 9} y={box.y + 21} dominantBaseline="central" fontSize={11} fontWeight={500} fill="var(--text-2)">
          {truncate(box.chip, 30)}
        </text>
        <text x={box.x + pad} y={box.y + (box.subtitle ? 47 : 50)} fontSize={14} fontWeight={500} fill={c.text}>
          {truncate(box.title, 54)}
        </text>
        {box.subtitle ? (
          <text x={box.x + pad} y={box.y + 64} fontSize={11.5} fill={c.text} opacity={0.72}>
            {truncate(box.subtitle, 66)}
          </text>
        ) : null}
      </g>
    );
  }

  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  // …existing centered rendering unchanged…
```

> Keep the existing `cx`/`cy` and the rest of the centered return exactly as-is below the new branch (topology + matrix still use it). `truncate` already exists in the file.

- [ ] **Step 4: Run → confirm PASS + tsc + the layout suite (no regressions)**

`npx vitest run components/workflow && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add components/workflow/WorkflowDiagram.tsx components/workflow/WorkflowDiagram.test.tsx
git commit -m "feat(workflow): render swimlane steps as vertical cards (chip + title + description)"
```

- [ ] **Step 6: Browser verification (controller)**

The implementer SKIPS the browser. The controller verifies on the real Vizta tenant: open a surfaced opportunity → Workflow tab shows the vertical card stack (role chip, full titles, evidence description lines, red bottlenecks), and screenshots it. (Diagrams render server-side; if the dev preview's tab hydration stalls, temporarily default the initial tab to `workflow` for the screenshot, then revert — as done previously.) No recompute needed: the layout reads existing data; descriptions come from existing captures.

---

## Self-Review (completed during planning)

**Design coverage:** vertical cards (Task 3), role chip (Tasks 1+3+4), evidence description deduped (Task 2), full titles via wider truncation + tooltip (Task 4), bottleneck red / inferred dashed preserved (`stepTone` + `dashed` unchanged). Swimlane-only; topology + matrix untouched (their boxes never set `chip`, so `Box` falls through to the centered branch).

**No engine/recompute:** descriptions come from `loadOpportunityWorkflow` reading existing captures; the stored graph is untouched; `detail` is render-only (LLM never sets it, not in any prompt).

**Type consistency:** `detail` added to `workflowStep` (Task 1) is read by `loadOpportunityWorkflow` (Task 2) and `layoutSwimlane` (Task 3). `chip` added to `LayoutBox` (Task 1) is set by `layoutSwimlane` (Task 3) and consumed by `Box` (Task 4). Other layouts leave `chip` undefined → unchanged rendering.

**Placeholder scan:** the one literal to fill is `CAP_A` in Task 2's test (a seeded capture id from that test file) — flagged explicitly, not a silent gap.

**Risks:** (a) very long evidence summaries — handled by truncation + `<title>` tooltip; (b) a multi-step skip/branch edge — handled by `routeEdgeVertical`'s side route; (c) tall diagrams — the SVG scales to container width via `width="100%"`, page scrolls vertically (the opp panel already has `overflow-x-auto`).
