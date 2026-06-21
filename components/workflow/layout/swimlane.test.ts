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
