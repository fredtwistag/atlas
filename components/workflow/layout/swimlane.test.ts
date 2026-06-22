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
  it("sets the role chip + wrapped body lines per card", () => {
    const s2 = l.boxes.find((b) => b.id === "s2")!;
    expect(s2.chip).toBe("Comercial");
    expect(s2.subtitle).toBe("Merges edits from many email threads");
    expect(s2.bodyLines).toEqual(["Merges edits from many email threads"]);
    expect(s2.tone).toBe("red");                           // bottleneck
    const s1 = l.boxes.find((b) => b.id === "s1")!;
    expect(s1.subtitle).toBe("inferred");
    expect(s1.bodyLines).toEqual(["inferred"]);
    expect(s1.dashed).toBe(true);
  });
  it("gives each card real height with bottom padding", () => {
    // 1-line description card: TITLE_BLOCK(50) + 1*LINE_H(16) + BOTTOM_PAD(16)
    expect(l.boxes.find((b) => b.id === "s2")!.h).toBe(82);
  });
  it("connects consecutive cards with sequential gray down-arrows", () => {
    expect(l.edges).toHaveLength(l.boxes.length - 1);      // n-1 sequential
    expect(l.edges.every((e) => e.tone === "gray")).toBe(true); // never coloured
    // dashed when an inferred card is an endpoint (s1 is inferred)
    expect(l.edges[0].dashed).toBe(true);
    expect(l.edges[1].dashed).toBe(false);
    // straight vertical: both points share x
    expect(l.edges[0].points[0].x).toBe(l.edges[0].points[1].x);
  });
});
