# Workflow Maps — Renderer & Report Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the persisted `workflow_maps` graphs (from Plan 1) into rendered SVG diagrams in the client report — a deterministic layout→SVG renderer family for swimlane / systems_topology / impact_effort, plus a read path and a "How the work flows today" report section.

**Architecture:** Pure layout functions (`WorkflowGraph` → positioned primitives) under `components/workflow/layout/`, snapshot-light structural tests. One `WorkflowDiagram` server component renders the primitives to inline SVG using CSS-variable fills (no charting lib). `loadWorkflowMaps` resolves each map's evidence to name+role at read time and runs under tenant RLS (so only `surfaced` maps reach a client). A new `sprint.workflowMaps` tRPC procedure feeds a report section.

**Tech Stack:** TypeScript (strict), React 19 server components, inline SVG + `design/tokens.css` CSS vars, Drizzle + RLS, tRPC, vitest (+ jsdom + @testing-library/react for the component).

**Spec:** `docs/superpowers/specs/2026-06-21-workflow-maps-design.md` (§9 rendering, §10 integration). **Depends on Plan 1** (the `workflow_maps` table, `WorkflowGraph`/`WorkflowGraphDraft` types, and `services/synthesis/workflows/types.ts` must exist).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `components/workflow/layout/types.ts` | Layout primitive types (`Layout`, `LayoutBox`, …, `Tone`) | Create |
| `components/workflow/layout/shared.ts` (+test) | `assignColumns`, `stepTone`, `stepShape`, `routeEdge` (pure) | Create |
| `components/workflow/layout/swimlane.ts` (+test) | `layoutSwimlane` (pure) | Create |
| `components/workflow/layout/topology.ts` (+test) | `layoutTopology` (pure) | Create |
| `components/workflow/layout/matrix.ts` (+test) | `layoutMatrix` (pure) | Create |
| `components/workflow/WorkflowDiagram.tsx` (+test) | Layout → inline SVG, honesty primitives | Create |
| `services/synthesis/workflows/types.ts` | add `WorkflowMapView` | Modify |
| `lib/sprint-read.ts` | `loadWorkflowMaps` (resolves evidence to name+role) | Modify |
| `db/workflow-maps.integration.test.ts` | add a `loadWorkflowMaps` read test | Modify |
| `server/trpc/routers/sprint.ts` | `workflowMaps` tRPC procedure | Modify |
| `app/(app)/sprint/[id]/report/page.tsx` | fetch + pass `workflowMaps` | Modify |
| `components/report/ReportArticle.tsx` | "How the work flows today" section | Modify |

**Commands:** unit `npx vitest run <path>`; component `npx vitest run <path>` (jsdom pragma in-file); integration `npx vitest run -c vitest.integration.config.ts <path>`; typecheck `npx tsc --noEmit`.

---

## Task 1: Layout primitive types + shared helpers

**Files:**
- Create: `components/workflow/layout/types.ts`
- Create: `components/workflow/layout/shared.ts`
- Create: `components/workflow/layout/shared.test.ts`

- [ ] **Step 1: Write `types.ts`**

```typescript
export type Tone = "blue" | "amber" | "red" | "green" | "purple" | "gray";

export interface LayoutLane {
  id: string;
  label: string;
  y: number;
  h: number;
}

export interface LayoutBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  subtitle: string | null;
  tone: Tone;
  shape: "rect" | "diamond" | "circle";
  dashed: boolean;
}

export interface LayoutEdge {
  id: string;
  points: { x: number; y: number }[];
  dashed: boolean;
  tone: Tone;
}

export interface LayoutLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dashed: boolean;
}

export interface LayoutText {
  x: number;
  y: number;
  text: string;
  anchor: "start" | "middle" | "end";
  muted: boolean;
}

export interface Layout {
  width: number;
  height: number;
  lanes: LayoutLane[];
  boxes: LayoutBox[];
  edges: LayoutEdge[];
  lines: LayoutLine[];
  texts: LayoutText[];
}
```

- [ ] **Step 2: Write the failing test `shared.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { assignColumns, stepTone, stepShape, routeEdge } from "./shared";
import type { WorkflowStep } from "@/services/llm/schemas";
import type { LayoutBox } from "./types";

function step(p: Partial<WorkflowStep>): WorkflowStep {
  return { id: "s", label: "x", laneId: null, stepKind: "step", inferred: false, captureIds: [], metric: null, ...p };
}

describe("assignColumns", () => {
  it("places each target at least one column right of its source", () => {
    const cols = assignColumns(["a", "b", "c"], [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ]);
    expect(cols.get("a")).toBe(0);
    expect(cols.get("b")).toBe(1);
    expect(cols.get("c")).toBe(2);
  });

  it("terminates on a cycle without throwing", () => {
    const cols = assignColumns(["a", "b"], [
      { from: "a", to: "b" },
      { from: "b", to: "a" },
    ]);
    expect(cols.size).toBe(2);
  });
});

describe("stepTone / stepShape", () => {
  it("maps bottleneck and gap to red, shadow_tool to amber, inferred to gray", () => {
    expect(stepTone(step({ stepKind: "bottleneck" }))).toBe("red");
    expect(stepTone(step({ stepKind: "gap" }))).toBe("red");
    expect(stepTone(step({ stepKind: "shadow_tool" }))).toBe("amber");
    expect(stepTone(step({ inferred: true, stepKind: "step" }))).toBe("gray");
    expect(stepTone(step({ stepKind: "step" }))).toBe("blue");
  });
  it("uses a diamond only for decisions", () => {
    expect(stepShape(step({ stepKind: "decision" }))).toBe("diamond");
    expect(stepShape(step({ stepKind: "step" }))).toBe("rect");
  });
});

describe("routeEdge", () => {
  const a: LayoutBox = { id: "a", x: 0, y: 0, w: 100, h: 40, title: "", subtitle: null, tone: "blue", shape: "rect", dashed: false };
  it("is a straight 2-point line when boxes share a row", () => {
    const b: LayoutBox = { ...a, id: "b", x: 200, y: 0 };
    expect(routeEdge(a, b)).toHaveLength(2);
  });
  it("bends (≥3 points) when boxes are on different rows", () => {
    const b: LayoutBox = { ...a, id: "b", x: 200, y: 120 };
    expect(routeEdge(a, b).length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run components/workflow/layout/shared.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Write `shared.ts`**

```typescript
import type { WorkflowStep } from "@/services/llm/schemas";
import type { LayoutBox, Tone } from "./types";

/**
 * Left-to-right column index per step id, respecting edge direction. Starts
 * every step at column 0 and relaxes: a target sits ≥1 column right of its
 * source. Capped at `stepIds.length` passes so a cycle terminates.
 */
export function assignColumns(
  stepIds: string[],
  edges: { from: string; to: string }[],
): Map<string, number> {
  const col = new Map<string, number>();
  for (const id of stepIds) col.set(id, 0);
  for (let pass = 0; pass < stepIds.length; pass++) {
    let changed = false;
    for (const e of edges) {
      if (!col.has(e.from) || !col.has(e.to)) continue;
      const want = (col.get(e.from) as number) + 1;
      if ((col.get(e.to) as number) < want) {
        col.set(e.to, want);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return col;
}

export function stepTone(step: WorkflowStep): Tone {
  if (step.inferred) return "gray";
  switch (step.stepKind) {
    case "bottleneck":
    case "gap":
      return "red";
    case "shadow_tool":
      return "amber";
    case "start":
    case "end":
      return "gray";
    default:
      return "blue";
  }
}

export function stepShape(step: WorkflowStep): "rect" | "diamond" | "circle" {
  return step.stepKind === "decision" ? "diamond" : "rect";
}

/** Orthogonal connector from a's right edge to b's left edge; L-bend across rows. */
export function routeEdge(a: LayoutBox, b: LayoutBox): { x: number; y: number }[] {
  const start = { x: a.x + a.w, y: a.y + a.h / 2 };
  const end = { x: b.x - 8, y: b.y + b.h / 2 };
  if (Math.abs(start.y - end.y) < 1) return [start, end];
  const midX = (start.x + b.x) / 2;
  return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run components/workflow/layout/shared.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add components/workflow/layout/types.ts components/workflow/layout/shared.ts components/workflow/layout/shared.test.ts
git commit -m "feat(workflow-render): layout primitive types + shared helpers"
```

---

## Task 2: `layoutSwimlane` (pure)

**Files:**
- Create: `components/workflow/layout/swimlane.ts`
- Create: `components/workflow/layout/swimlane.test.ts`

- [ ] **Step 1: Write the failing test `swimlane.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { layoutSwimlane } from "./swimlane";
import type { WorkflowGraph } from "@/services/synthesis/workflows/types";

const graph: WorkflowGraph = {
  kind: "swimlane",
  title: "Deal to order",
  lanes: [
    { id: "l-sales", roleLabel: "Sales", department: "Sales" },
    { id: "l-ops", roleLabel: "Ops", department: "Ops" },
  ],
  steps: [
    { id: "s1", label: "Log deal", laneId: "l-sales", stepKind: "step", inferred: false, captureIds: [], metric: null },
    { id: "s2", label: "Re-key", laneId: "l-ops", stepKind: "bottleneck", inferred: false, captureIds: [], metric: null },
  ],
  edges: [
    { id: "e1", from: "s1", to: "s2", edgeKind: "handoff", label: null, inferred: false, captureIds: [] },
  ],
  confidence: { score: 0.8, coverage: 1, corroboratedCount: 1, disputedStepIds: [] },
  modelVersion: "m",
};

describe("layoutSwimlane", () => {
  it("gives each lane its own y band", () => {
    const l = layoutSwimlane(graph);
    expect(l.lanes).toHaveLength(2);
    expect(l.lanes[1].y).toBeGreaterThan(l.lanes[0].y);
  });
  it("places a step inside its lane's vertical band", () => {
    const l = layoutSwimlane(graph);
    const s2 = l.boxes.find((b) => b.id === "s2")!;
    const opsLane = l.lanes.find((ln) => ln.id === "l-ops")!;
    expect(s2.y).toBeGreaterThanOrEqual(opsLane.y);
    expect(s2.y + s2.h).toBeLessThanOrEqual(opsLane.y + opsLane.h);
    expect(s2.tone).toBe("red"); // bottleneck
  });
  it("routes a cross-lane handoff with a bend", () => {
    const l = layoutSwimlane(graph);
    expect(l.edges[0].points.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/workflow/layout/swimlane.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `swimlane.ts`**

```typescript
import type { WorkflowGraph } from "@/services/synthesis/workflows/types";
import type { Layout, LayoutBox, LayoutEdge, LayoutLane } from "./types";
import { assignColumns, routeEdge, stepShape, stepTone } from "./shared";

const LABEL_W = 110;
const LANE_H = 76;
const X0 = LABEL_W + 40;
const STEP_W = 130;
const STEP_H = 44;
const GAP = 40;
const TOP = 56;

export function layoutSwimlane(graph: WorkflowGraph): Layout {
  const lanes =
    graph.lanes.length > 0
      ? graph.lanes
      : [{ id: "_all", roleLabel: "Workflow", department: null }];
  const laneIndex = new Map(lanes.map((l, i) => [l.id, i]));

  const col = assignColumns(graph.steps.map((s) => s.id), graph.edges);
  const ordered = [...graph.steps].sort(
    (a, b) => (col.get(a.id) as number) - (col.get(b.id) as number),
  );

  const slotByLane = new Map<number, number>();
  const boxes: LayoutBox[] = [];
  const boxById = new Map<string, LayoutBox>();

  for (const step of ordered) {
    const li = laneIndex.get(step.laneId ?? "") ?? 0;
    const slot = slotByLane.get(li) ?? 0;
    slotByLane.set(li, slot + 1);
    const box: LayoutBox = {
      id: step.id,
      x: X0 + slot * (STEP_W + GAP),
      y: TOP + li * LANE_H + (LANE_H - STEP_H) / 2,
      w: STEP_W,
      h: STEP_H,
      title: step.label,
      subtitle: step.inferred ? "inferred" : null,
      tone: stepTone(step),
      shape: stepShape(step),
      dashed: step.inferred,
    };
    boxes.push(box);
    boxById.set(step.id, box);
  }

  const edges: LayoutEdge[] = [];
  for (const e of graph.edges) {
    const a = boxById.get(e.from);
    const b = boxById.get(e.to);
    if (!a || !b) continue;
    edges.push({
      id: e.id,
      points: routeEdge(a, b),
      dashed: e.inferred || e.edgeKind === "gap",
      tone: e.edgeKind === "gap" ? "red" : "gray",
    });
  }

  const maxRight = boxes.reduce((m, b) => Math.max(m, b.x + b.w), X0);
  const layoutLanes: LayoutLane[] = lanes.map((l, i) => ({
    id: l.id,
    label: l.roleLabel,
    y: TOP + i * LANE_H,
    h: LANE_H,
  }));

  return {
    width: Math.max(680, maxRight + 40),
    height: TOP + lanes.length * LANE_H + 24,
    lanes: layoutLanes,
    boxes,
    edges,
    lines: [],
    texts: [],
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/workflow/layout/swimlane.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/workflow/layout/swimlane.ts components/workflow/layout/swimlane.test.ts
git commit -m "feat(workflow-render): swimlane layout"
```

---

## Task 3: `layoutTopology` (pure)

**Files:**
- Create: `components/workflow/layout/topology.ts`
- Create: `components/workflow/layout/topology.test.ts`

- [ ] **Step 1: Write the failing test `topology.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { layoutTopology } from "./topology";
import type { WorkflowGraph } from "@/services/synthesis/workflows/types";

const graph: WorkflowGraph = {
  kind: "systems_topology",
  title: "Tools",
  lanes: [],
  steps: [
    { id: "crm", label: "CRM", laneId: null, stepKind: "system", inferred: false, captureIds: [], metric: null },
    { id: "sheet", label: "Pricing sheet", laneId: null, stepKind: "shadow_tool", inferred: false, captureIds: [], metric: null },
    { id: "erp", label: "ERP", laneId: null, stepKind: "system", inferred: false, captureIds: [], metric: null },
  ],
  edges: [
    { id: "e1", from: "crm", to: "sheet", edgeKind: "flow", label: null, inferred: false, captureIds: [] },
    { id: "e2", from: "sheet", to: "erp", edgeKind: "gap", label: null, inferred: false, captureIds: [] },
  ],
  confidence: { score: 0.7, coverage: 1, corroboratedCount: 1, disputedStepIds: [] },
  modelVersion: "m",
};

describe("layoutTopology", () => {
  it("lays the systems out left to right without overlap", () => {
    const l = layoutTopology(graph);
    expect(l.boxes).toHaveLength(3);
    const xs = l.boxes.map((b) => b.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    expect(l.boxes.find((b) => b.id === "sheet")!.tone).toBe("amber");
  });
  it("draws the integration gap edge dashed + red", () => {
    const l = layoutTopology(graph);
    const gap = l.edges.find((e) => e.id === "e2")!;
    expect(gap.dashed).toBe(true);
    expect(gap.tone).toBe("red");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/workflow/layout/topology.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `topology.ts`**

```typescript
import type { WorkflowGraph, } from "@/services/synthesis/workflows/types";
import type { WorkflowStep } from "@/services/llm/schemas";
import type { Layout, LayoutBox, LayoutEdge } from "./types";
import { assignColumns, routeEdge, stepTone } from "./shared";

const X0 = 60;
const Y = 90;
const STEP_W = 150;
const STEP_H = 56;
const GAP = 56;

function subtitle(step: WorkflowStep): string | null {
  if (step.inferred) return "inferred";
  if (step.stepKind === "shadow_tool") return "shadow tool";
  if (step.stepKind === "system") return "system";
  return null;
}

export function layoutTopology(graph: WorkflowGraph): Layout {
  const col = assignColumns(graph.steps.map((s) => s.id), graph.edges);
  const ordered = [...graph.steps].sort(
    (a, b) => (col.get(a.id) as number) - (col.get(b.id) as number),
  );

  const boxes: LayoutBox[] = [];
  const boxById = new Map<string, LayoutBox>();
  ordered.forEach((step, i) => {
    const box: LayoutBox = {
      id: step.id,
      x: X0 + i * (STEP_W + GAP),
      y: Y,
      w: STEP_W,
      h: STEP_H,
      title: step.label,
      subtitle: subtitle(step),
      tone: stepTone(step),
      shape: "rect",
      dashed: step.inferred,
    };
    boxes.push(box);
    boxById.set(step.id, box);
  });

  const edges: LayoutEdge[] = [];
  for (const e of graph.edges) {
    const a = boxById.get(e.from);
    const b = boxById.get(e.to);
    if (!a || !b) continue;
    edges.push({
      id: e.id,
      points: routeEdge(a, b),
      dashed: e.inferred || e.edgeKind === "gap",
      tone: e.edgeKind === "gap" ? "red" : "gray",
    });
  }

  const maxRight = boxes.reduce((m, b) => Math.max(m, b.x + b.w), X0);
  return {
    width: Math.max(680, maxRight + 40),
    height: Y + STEP_H + 40,
    lanes: [],
    boxes,
    edges,
    lines: [],
    texts: [],
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/workflow/layout/topology.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/workflow/layout/topology.ts components/workflow/layout/topology.test.ts
git commit -m "feat(workflow-render): systems topology layout"
```

---

## Task 4: `layoutMatrix` (pure — impact/effort 2×2)

**Files:**
- Create: `components/workflow/layout/matrix.ts`
- Create: `components/workflow/layout/matrix.test.ts`

- [ ] **Step 1: Write the failing test `matrix.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { layoutMatrix } from "./matrix";
import type { WorkflowGraph } from "@/services/synthesis/workflows/types";

const graph: WorkflowGraph = {
  kind: "impact_effort",
  title: "Impact vs. effort",
  lanes: [],
  steps: [
    { id: "o0", label: "Quick win", laneId: null, stepKind: "step", inferred: false, captureIds: [], metric: { x: 1, y: 100 } },
    { id: "o1", label: "Big bet", laneId: null, stepKind: "step", inferred: false, captureIds: [], metric: { x: 9, y: 100 } },
    { id: "o2", label: "Minor", laneId: null, stepKind: "step", inferred: false, captureIds: [], metric: { x: 1, y: 1 } },
  ],
  confidence: { score: 1, coverage: 1, corroboratedCount: 3, disputedStepIds: [] },
  edges: [],
  modelVersion: "pure-ts",
};

describe("layoutMatrix", () => {
  it("plots one numbered circle per opportunity", () => {
    const l = layoutMatrix(graph);
    expect(l.boxes).toHaveLength(3);
    expect(l.boxes.every((b) => b.shape === "circle")).toBe(true);
    expect(l.boxes.map((b) => b.title)).toEqual(["1", "2", "3"]);
  });
  it("puts high impact higher (smaller y) than low impact", () => {
    const l = layoutMatrix(graph);
    const quick = l.boxes.find((b) => b.id === "o0")!;
    const minor = l.boxes.find((b) => b.id === "o2")!;
    expect(quick.y).toBeLessThan(minor.y);
  });
  it("tones the low-effort/high-impact point green (quick win)", () => {
    const l = layoutMatrix(graph);
    expect(l.boxes.find((b) => b.id === "o0")!.tone).toBe("green");
    expect(l.boxes.find((b) => b.id === "o1")!.tone).toBe("purple");
  });
  it("draws axes + quadrant dividers", () => {
    const l = layoutMatrix(graph);
    expect(l.lines.length).toBeGreaterThanOrEqual(4);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/workflow/layout/matrix.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `matrix.ts`**

```typescript
import type { WorkflowGraph } from "@/services/synthesis/workflows/types";
import type { Layout, LayoutBox, LayoutLine, LayoutText, Tone } from "./types";

const PLOT_X0 = 150;
const PLOT_X1 = 560;
const PLOT_Y0 = 70;
const PLOT_Y1 = 320;
const R = 10;

function quadrantTone(x: number, y: number, mx: number, my: number): Tone {
  const lowEffort = x <= mx;
  const highImpact = y >= my;
  if (lowEffort && highImpact) return "green"; // quick win
  if (!lowEffort && highImpact) return "purple"; // big bet
  return "gray";
}

export function layoutMatrix(graph: WorkflowGraph): Layout {
  const pts = graph.steps
    .filter((s) => s.metric)
    .map((s) => ({ id: s.id, x: s.metric!.x, y: s.metric!.y }));

  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const xMin = Math.min(...xs, 0);
  const xMax = Math.max(...xs, 1);
  const yMin = Math.min(...ys, 0);
  const yMax = Math.max(...ys, 1);
  const mx = (xMin + xMax) / 2;
  const my = (yMin + yMax) / 2;

  const sx = (x: number) =>
    PLOT_X0 + ((x - xMin) / (xMax - xMin || 1)) * (PLOT_X1 - PLOT_X0);
  const sy = (y: number) =>
    PLOT_Y1 - ((y - yMin) / (yMax - yMin || 1)) * (PLOT_Y1 - PLOT_Y0);

  const boxes: LayoutBox[] = pts.map((p, i) => ({
    id: p.id,
    x: sx(p.x) - R,
    y: sy(p.y) - R,
    w: R * 2,
    h: R * 2,
    title: String(i + 1),
    subtitle: null,
    tone: quadrantTone(p.x, p.y, mx, my),
    shape: "circle",
    dashed: false,
  }));

  const midX = (PLOT_X0 + PLOT_X1) / 2;
  const midY = (PLOT_Y0 + PLOT_Y1) / 2;
  const lines: LayoutLine[] = [
    { x1: PLOT_X0, y1: PLOT_Y0, x2: PLOT_X0, y2: PLOT_Y1, dashed: false },
    { x1: PLOT_X0, y1: PLOT_Y1, x2: PLOT_X1, y2: PLOT_Y1, dashed: false },
    { x1: midX, y1: PLOT_Y0, x2: midX, y2: PLOT_Y1, dashed: true },
    { x1: PLOT_X0, y1: midY, x2: PLOT_X1, y2: midY, dashed: true },
  ];

  const texts: LayoutText[] = [
    { x: PLOT_X0, y: PLOT_Y0 - 12, text: "Higher impact", anchor: "start", muted: true },
    { x: PLOT_X1, y: PLOT_Y1 + 24, text: "Higher effort", anchor: "end", muted: true },
    { x: PLOT_X0 + 10, y: PLOT_Y0 + 14, text: "Quick wins", anchor: "start", muted: true },
    { x: PLOT_X1 - 10, y: PLOT_Y0 + 14, text: "Big bets", anchor: "end", muted: true },
    { x: PLOT_X1 - 10, y: PLOT_Y1 - 8, text: "Deprioritize", anchor: "end", muted: true },
  ];

  return { width: 680, height: 360, lanes: [], boxes, edges: [], lines, texts };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/workflow/layout/matrix.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/workflow/layout/matrix.ts components/workflow/layout/matrix.test.ts
git commit -m "feat(workflow-render): impact/effort matrix layout"
```

---

## Task 5: `WorkflowDiagram` component (layout → SVG)

**Files:**
- Create: `components/workflow/WorkflowDiagram.tsx`
- Create: `components/workflow/WorkflowDiagram.test.tsx`

- [ ] **Step 1: Write the failing test `WorkflowDiagram.test.tsx`**

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { WorkflowDiagram } from "./WorkflowDiagram";
import type { WorkflowGraph } from "@/services/synthesis/workflows/types";

const swimlane: WorkflowGraph = {
  kind: "swimlane",
  title: "Deal to order",
  lanes: [{ id: "l1", roleLabel: "Sales", department: null }],
  steps: [
    { id: "s1", label: "Log deal", laneId: "l1", stepKind: "step", inferred: false, captureIds: [], metric: null },
    { id: "s2", label: "Inferred link", laneId: "l1", stepKind: "step", inferred: true, captureIds: [], metric: null },
  ],
  edges: [{ id: "e1", from: "s1", to: "s2", edgeKind: "flow", label: null, inferred: false, captureIds: [] }],
  confidence: { score: 0.8, coverage: 1, corroboratedCount: 1, disputedStepIds: [] },
  modelVersion: "m",
};

describe("WorkflowDiagram", () => {
  it("renders an svg containing the step labels", () => {
    const { container } = render(<WorkflowDiagram graph={swimlane} />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).toContain("Log deal");
  });
  it("renders inferred elements dashed", () => {
    const { container } = render(<WorkflowDiagram graph={swimlane} />);
    expect(container.querySelectorAll("[stroke-dasharray]").length).toBeGreaterThan(0);
  });
  it("renders nothing for an unsupported kind", () => {
    const { container } = render(
      <WorkflowDiagram graph={{ ...swimlane, kind: "raci_grid" }} />,
    );
    expect(container.querySelector("svg")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/workflow/WorkflowDiagram.test.tsx`
Expected: FAIL (module not found). If it errors on JSX/jsdom, confirm an existing component test (e.g. `components/ScoreBadge.test.tsx`) and match its `@testing-library/react` import + any environment pragma.

- [ ] **Step 3: Write `WorkflowDiagram.tsx`**

```typescript
import type { WorkflowGraph } from "@/services/synthesis/workflows/types";
import type { Layout, LayoutBox, Tone } from "./layout/types";
import { layoutSwimlane } from "./layout/swimlane";
import { layoutTopology } from "./layout/topology";
import { layoutMatrix } from "./layout/matrix";

const TONE: Record<Tone, { fill: string; stroke: string; text: string }> = {
  blue: { fill: "var(--blue-100)", stroke: "var(--blue-700)", text: "var(--blue-1000)" },
  amber: { fill: "var(--amber-100)", stroke: "var(--amber-800)", text: "var(--amber-1000)" },
  red: { fill: "var(--red-100)", stroke: "var(--red-800)", text: "var(--red-1000)" },
  green: { fill: "var(--green-100)", stroke: "var(--green-800)", text: "var(--green-1000)" },
  purple: { fill: "var(--purple-100)", stroke: "var(--purple-700)", text: "var(--purple-1000)" },
  gray: { fill: "var(--surface-2)", stroke: "var(--border-strong)", text: "var(--text)" },
};

function pickLayout(graph: WorkflowGraph): Layout | null {
  switch (graph.kind) {
    case "swimlane":
      return layoutSwimlane(graph);
    case "systems_topology":
      return layoutTopology(graph);
    case "impact_effort":
      return layoutMatrix(graph);
    default:
      return null; // Plan 3 / fast-follow kinds not yet rendered
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function Box({ box }: { box: LayoutBox }) {
  const c = TONE[box.tone];
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dash = box.dashed ? "4 3" : undefined;
  return (
    <g>
      {box.shape === "circle" ? (
        <circle cx={cx} cy={cy} r={box.w / 2} fill={c.fill} stroke={c.stroke} strokeWidth={1} strokeDasharray={dash} />
      ) : box.shape === "diamond" ? (
        <polygon
          points={`${cx},${box.y} ${box.x + box.w},${cy} ${cx},${box.y + box.h} ${box.x},${cy}`}
          fill={c.fill}
          stroke={c.stroke}
          strokeWidth={1}
          strokeDasharray={dash}
        />
      ) : (
        <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={8} fill={c.fill} stroke={c.stroke} strokeWidth={1} strokeDasharray={dash} />
      )}
      {box.title ? (
        <text x={cx} y={box.subtitle ? cy - 7 : cy} textAnchor="middle" dominantBaseline="central" fontSize={box.shape === "circle" ? 11 : 13} fontWeight={500} fill={c.text}>
          {truncate(box.title, 20)}
        </text>
      ) : null}
      {box.subtitle ? (
        <text x={cx} y={cy + 9} textAnchor="middle" dominantBaseline="central" fontSize={11} fill={c.text} opacity={0.75}>
          {box.subtitle}
        </text>
      ) : null}
    </g>
  );
}

/** Deterministic SVG renderer for a workflow graph. Pure: no hooks, no I/O. */
export function WorkflowDiagram({ graph }: { graph: WorkflowGraph }) {
  const layout = pickLayout(graph);
  if (!layout) return null;
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="img"
      aria-label={graph.title}
      preserveAspectRatio="xMidYMid meet"
      className="not-prose"
    >
      <title>{graph.title}</title>
      <defs>
        <marker id="wf-arrow" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
          <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>

      {layout.lanes.map((lane, i) => (
        <g key={lane.id}>
          <rect x={40} y={lane.y} width={layout.width - 80} height={lane.h} fill={i % 2 ? "var(--surface-2)" : "var(--surface)"} stroke="var(--border)" strokeWidth={0.5} />
          <text x={95} y={lane.y + lane.h / 2} textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight={500} fill="var(--text-2)">
            {lane.label}
          </text>
        </g>
      ))}

      {layout.lines.map((ln, i) => (
        <line key={i} x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2} stroke={ln.dashed ? "var(--text-faint)" : "var(--border-strong)"} strokeWidth={0.75} strokeDasharray={ln.dashed ? "4 4" : undefined} />
      ))}

      {layout.edges.map((e) => (
        <polyline key={e.id} points={e.points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={e.tone === "red" ? "var(--red-700)" : "var(--text-3)"} strokeWidth={1.5} strokeDasharray={e.dashed ? "5 4" : undefined} markerEnd="url(#wf-arrow)" />
      ))}

      {layout.boxes.map((b) => (
        <Box key={b.id} box={b} />
      ))}

      {layout.texts.map((t, i) => (
        <text key={i} x={t.x} y={t.y} textAnchor={t.anchor} dominantBaseline="central" fontSize={12} fill={t.muted ? "var(--text-3)" : "var(--text)"}>
          {t.text}
        </text>
      ))}
    </svg>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/workflow/WorkflowDiagram.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/workflow/WorkflowDiagram.tsx components/workflow/WorkflowDiagram.test.tsx
git commit -m "feat(workflow-render): WorkflowDiagram SVG component"
```

---

## Task 6: `WorkflowMapView` type + `loadWorkflowMaps` read

**Files:**
- Modify: `services/synthesis/workflows/types.ts`
- Modify: `lib/sprint-read.ts`
- Modify: `db/workflow-maps.integration.test.ts`

- [ ] **Step 1: Add `WorkflowMapView` to `services/synthesis/workflows/types.ts`**

Add these imports at the top and the interface at the bottom:

```typescript
import type { WorkflowKind } from "@/services/llm/schemas";
import type { Capture } from "@/lib/types";

// ... existing WorkflowCapture / OpportunityPoint / WorkflowConfidence / WorkflowGraph ...

/** A workflow map resolved for rendering: graph + name/role-attributed evidence. */
export interface WorkflowMapView {
  id: string;
  kind: WorkflowKind;
  title: string;
  graph: WorkflowGraph;
  confidence: WorkflowConfidence;
  basedOnSessions: number;
  evidence: Capture[];
}
```

- [ ] **Step 2: Write the failing read test (append to `db/workflow-maps.integration.test.ts`)**

Add the imports `users, captures` to the existing `./schema` import line, `loadWorkflowMaps` from `@/lib/sprint-read`, and this block:

```typescript
import { loadWorkflowMaps } from "@/lib/sprint-read";
// (add `users, captures` to the existing `import { sprints, workflowMaps } from "./schema";`)

const USER_A1 = "00000000-0000-0000-0000-0000000000a1";
const CAP_1 = "00000000-0000-0000-0000-0000000000c1";

describe("loadWorkflowMaps", () => {
  it("returns surfaced maps with name+role-attributed evidence", async () => {
    await seedRow((tx) =>
      tx.insert(users).values({
        id: USER_A1,
        tenantId: TENANT_A,
        email: "rep@a.test",
        name: "Dana Rep",
        role: "ic",
        title: "Sales rep",
        department: "Sales",
      }),
    );
    await seedRow((tx) =>
      tx.insert(captures).values({
        id: CAP_1,
        tenantId: TENANT_A,
        userId: USER_A1,
        kind: "handoff",
        summary: "Sales emails the deal to ops",
        sourceQuote: "I just email it over",
      }),
    );
    await seedRow((tx) =>
      tx.insert(workflowMaps).values({
        tenantId: TENANT_A,
        sprintId: SPRINT_A,
        kind: "swimlane",
        status: "surfaced",
        graph: {
          kind: "swimlane",
          title: "Deal to order",
          lanes: [],
          steps: [{ id: "s1", label: "Log deal", laneId: null, stepKind: "step", inferred: false, captureIds: [CAP_1], metric: null }],
          edges: [],
          confidence: { score: 0.9, coverage: 1, corroboratedCount: 1, disputedStepIds: [] },
          modelVersion: "m",
        },
      }),
    );

    const maps = await asUser({ tenantId: TENANT_A, userId: USER_A1 }, (tx) =>
      loadWorkflowMaps(tx, SPRINT_A),
    );
    expect(maps).toHaveLength(1);
    expect(maps[0].evidence).toHaveLength(1);
    expect(maps[0].evidence[0].contributorName).toBe("Dana Rep");
    expect(maps[0].evidence[0].contributorRole).toBe("Sales rep");
  });
});
```

> The exact column set for `users`/`captures` must match the schema (Plan-1 reference: captures need `tenantId,userId,kind,summary,sourceQuote`; users need `tenantId,email,name,role,title,department`). If a NOT NULL column is missing, add it per `db/schema.ts`.

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run -c vitest.integration.config.ts db/workflow-maps.integration.test.ts`
Expected: FAIL (`loadWorkflowMaps` is not exported).

- [ ] **Step 4: Add `loadWorkflowMaps` to `lib/sprint-read.ts`**

Add `workflowMaps` to the `@/db/schema` import, `inArray` to the `drizzle-orm` import, and these type imports:

```typescript
import type {
  WorkflowGraph,
  WorkflowMapView,
} from "@/services/synthesis/workflows/types";
```

Then append the function:

```typescript
/**
 * Workflow diagram maps for a sprint, render-ready. Under a tenant context RLS
 * returns only `surfaced` maps; under a Twistag context it returns all. Evidence
 * captureIds are resolved to NAME + ROLE (de-anonymized 2026-06-20); removed
 * captures and email/userId never appear. Quotes deduped per map.
 */
export async function loadWorkflowMaps(
  tx: Db,
  sprintId: string,
): Promise<WorkflowMapView[]> {
  const rows = await tx
    .select({
      id: workflowMaps.id,
      graph: workflowMaps.graph,
    })
    .from(workflowMaps)
    .where(eq(workflowMaps.sprintId, sprintId))
    .orderBy(workflowMaps.kind);
  if (rows.length === 0) return [];

  const graphs = rows.map((r) => r.graph as WorkflowGraph);
  const allIds = new Set<string>();
  for (const g of graphs) {
    for (const s of g.steps) for (const id of s.captureIds) allIds.add(id);
    for (const e of g.edges) for (const id of e.captureIds) allIds.add(id);
  }

  const evRows =
    allIds.size > 0
      ? await tx
          .select({
            id: captures.id,
            kind: captures.kind,
            summary: captures.summary,
            sourceQuote: captures.sourceQuote,
            sessionId: captures.sessionId,
            tags: captures.tags,
            isEdited: captures.isEdited,
            isRemoved: captures.isRemoved,
            name: users.name,
            role: users.title,
          })
          .from(captures)
          .innerJoin(users, eq(captures.userId, users.id))
          .where(and(inArray(captures.id, [...allIds]), eq(captures.isRemoved, false)))
      : [];
  const capById = new Map(evRows.map((e) => [e.id, e]));

  return graphs.map((g, i) => {
    const ids = new Set<string>();
    for (const s of g.steps) for (const id of s.captureIds) ids.add(id);
    for (const e of g.edges) for (const id of e.captureIds) ids.add(id);

    const evidence: Capture[] = [];
    const seenQuotes = new Set<string>();
    const sessionsSet = new Set<string>();
    for (const id of ids) {
      const e = capById.get(id);
      if (!e) continue;
      if (e.sessionId) sessionsSet.add(e.sessionId);
      const key = e.sourceQuote.toLowerCase().replace(/\s+/g, " ").trim();
      if (seenQuotes.has(key)) continue;
      seenQuotes.add(key);
      evidence.push({
        id: e.id,
        kind: e.kind as Capture["kind"],
        summary: e.summary,
        sourceQuote: e.sourceQuote,
        contributorName: e.name,
        contributorRole: e.role ?? "Contributor",
        sessionId: e.sessionId,
        tags: e.tags,
        isEdited: e.isEdited,
        isRemoved: e.isRemoved,
      });
    }

    return {
      id: rows[i].id,
      kind: g.kind,
      title: g.title,
      graph: g,
      confidence: g.confidence,
      basedOnSessions: sessionsSet.size,
      evidence,
    };
  });
}
```

- [ ] **Step 5: Run to verify it passes + typecheck**

Run: `npx vitest run -c vitest.integration.config.ts db/workflow-maps.integration.test.ts && npx tsc --noEmit`
Expected: PASS (read test green) + no type errors.

- [ ] **Step 6: Commit**

```bash
git add services/synthesis/workflows/types.ts lib/sprint-read.ts db/workflow-maps.integration.test.ts
git commit -m "feat(sprint-read): loadWorkflowMaps with name+role evidence (RLS surfaced-only)"
```

---

## Task 7: `sprint.workflowMaps` tRPC procedure

**Files:**
- Modify: `server/trpc/routers/sprint.ts`

- [ ] **Step 1: Add `loadWorkflowMaps` to the sprint-read import**

In `server/trpc/routers/sprint.ts`, add `loadWorkflowMaps` to the existing `from "@/lib/sprint-read"` import list.

- [ ] **Step 2: Add the procedure next to `systemsInventory`**

```typescript
  /** Rendered-ready workflow diagram maps for a sprint (Plan 2). */
  workflowMaps: tenantProcedure
    .input(idInput)
    .query(({ ctx, input }) =>
      withTenantContext(ctx.session, (tx) => loadWorkflowMaps(tx, input.id)),
    ),
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (`idInput` is the same input object the sibling `systemsInventory`/`stakeholders` procedures use.)

- [ ] **Step 4: Commit**

```bash
git add server/trpc/routers/sprint.ts
git commit -m "feat(trpc): sprint.workflowMaps query"
```

---

## Task 8: Render the section in the report

**Files:**
- Modify: `app/(app)/sprint/[id]/report/page.tsx`
- Modify: `components/report/ReportArticle.tsx`

- [ ] **Step 1: Fetch workflow maps in the report page**

In `app/(app)/sprint/[id]/report/page.tsx`, extend the `Promise.all` and pass the result to `ReportArticle`:

```typescript
  const [p, opps, memo, workflowMaps] = await Promise.all([
    api.sprint.progress({ id }),
    api.opportunity.listForSprint({ sprintId: id }),
    api.sprint.synthesisMemo({ id }),
    api.sprint.workflowMaps({ id }),
  ]);
```

```typescript
      <ReportArticle
        sprint={sprint}
        progress={p}
        opps={opps}
        memo={memo}
        workflowMaps={workflowMaps}
        opportunityHref={(oid) => `/sprint/${id}/opportunity/${oid}`}
      />
```

- [ ] **Step 2: Accept the prop + render the section in `ReportArticle.tsx`**

Add imports at the top:

```typescript
import { WorkflowDiagram } from "@/components/workflow/WorkflowDiagram";
import type { WorkflowMapView } from "@/services/synthesis/workflows/types";
```

Add `workflowMaps` to the props (interface + destructure):

```typescript
export function ReportArticle({
  sprint,
  progress: p,
  opps,
  memo,
  workflowMaps,
  opportunityHref,
}: {
  sprint: Sprint;
  progress: SprintProgress;
  opps: Opportunity[];
  memo?: SynthesisMemo | null;
  workflowMaps?: WorkflowMapView[];
  opportunityHref?: (id: string) => string;
}) {
```

Insert this section immediately AFTER the "Opportunities, ranked" `</Section>` and before the roadmap section:

```typescript
      {/* How the work flows today (Plan 2) */}
      {workflowMaps && workflowMaps.length > 0 ? (
        <Section title="How the work flows today">
          <p>
            Synthesized from what contributors described — every step traces to
            the captures it came from. Steps Atlas inferred to connect the flow
            are shown dashed.
          </p>
          <div className="not-prose mt-4 space-y-8">
            {workflowMaps.map((m) => (
              <figure key={m.id} className="rounded-lg border border-border bg-surface p-4">
                <figcaption className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-text">{m.title}</span>
                  <span className="text-xs text-text-3">
                    Based on {m.basedOnSessions} session
                    {m.basedOnSessions === 1 ? "" : "s"}
                  </span>
                </figcaption>
                <WorkflowDiagram graph={m.graph} />
                {m.kind === "impact_effort" ? (
                  <ol className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-text-2">
                    {m.graph.steps.map((s, i) => (
                      <li key={s.id}>
                        {i + 1}. {s.label}
                      </li>
                    ))}
                  </ol>
                ) : null}
              </figure>
            ))}
          </div>
        </Section>
      ) : null}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Verify in the browser (preview)**

Start the dev server (preview_start), open a sprint report that has surfaced workflow maps (seed one via the Vizta dogfood harness + set a `workflow_maps` row to `status='surfaced'`, or run Plan 1's recompute then surface one in Plan 3). Confirm: the "How the work flows today" section renders a swimlane SVG, lanes are labeled, an inferred step is dashed, and the impact/effort matrix shows the numbered legend. Take a `preview_screenshot` to share.

> If no surfaced map exists yet, the section is correctly hidden (the `workflowMaps.length > 0` guard). That is expected until Plan 3's curation surfaces one.

- [ ] **Step 5: Run the full workflow render suite + typecheck**

Run: `npx vitest run components/workflow && npx tsc --noEmit`
Expected: PASS (all layout + component tests green).

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/sprint/[id]/report/page.tsx" components/report/ReportArticle.tsx
git commit -m "feat(report): How the work flows today — workflow diagrams section"
```

---

## Self-Review (completed during planning)

**Spec coverage (§9 rendering):**
- Renderer family under `components/workflow/` → Tasks 1–5 (one layout module per shape + one component), pure layout, snapshot-light structural tests.
- LLM emits structure / TS does layout → layout functions consume `WorkflowGraph`; no LLM here.
- Honesty primitives → inferred renders dashed + "inferred" subtitle (Task 5 test); bottleneck/gap red, shadow_tool amber (Tasks 1–3 tests); confidence + "based on N sessions" surfaced in the report figcaption (Task 8). `disputedStepIds` carried on the view for Plan 3 to badge.
- Shared renderer for report + (Plan 3) opportunity before/after + admin preview → single `WorkflowDiagram` keyed on `graph.kind`.

**Spec coverage (§10 integration):**
- `loadWorkflowMaps` in `lib/sprint-read.ts`, evidence → name+role, RLS-respecting → Task 6.
- Report section in `ReportArticle.tsx` → Task 8.
- tRPC read → Task 7.

**Privacy:** evidence resolved to name + role only (never email/userId); removed captures excluded; the SVG itself contains no contributor identity — names live in the evidence list, mirroring `loadOpportunityDetail`. Tenant RLS (`status='surfaced'`) keeps provisional maps off the client report (enforced in Plan 1's migration, exercised by Task 6's read under tenant context).

**Placeholder scan:** none. The two "match existing column set / test import" notes are guarded by concrete field lists + an existing file to mirror.

**Type consistency:** `Layout`/`LayoutBox`/`LayoutEdge`/`LayoutLine`/`LayoutText`/`Tone` defined once (Task 1) and consumed unchanged in Tasks 2–5. `WorkflowMapView` defined once (Task 6) and consumed by Tasks 7–8. `WorkflowGraph` (from Plan 1's `services/synthesis/workflows/types.ts`) is the single render input across all layout functions and the component. Layout function names `layoutSwimlane`/`layoutTopology`/`layoutMatrix` match between their files, `pickLayout`, and the report.

**Cross-plan dependency:** requires Plan 1 merged (table, schemas, `WorkflowGraph`/`WorkflowGraphDraft`, `stepKind` incl. `bottleneck`). Noted in the header.
