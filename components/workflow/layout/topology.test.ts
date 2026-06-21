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
