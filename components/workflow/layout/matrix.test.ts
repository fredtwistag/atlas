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
