import { describe, it, expect } from "vitest";
import { validateGraph } from "./validate";
import type { WorkflowGraphDraft } from "@/services/llm/schemas";

const C1 = "11111111-1111-4111-8111-111111111111";
const C2 = "22222222-2222-4222-8222-222222222222";
const FAKE = "99999999-9999-4999-8999-999999999999";

function graph(over: Partial<WorkflowGraphDraft>): WorkflowGraphDraft {
  return {
    kind: "swimlane",
    title: "t",
    lanes: [{ id: "lane-sales", roleLabel: "Sales", department: null }],
    steps: [],
    edges: [],
    ...over,
  };
}

describe("validateGraph", () => {
  const known = new Set([C1, C2]);

  it("drops a step with no real captureIds that is not inferred", () => {
    const g = graph({
      steps: [
        { id: "s1", label: "real", laneId: "lane-sales", stepKind: "step", inferred: false, captureIds: [C1], metric: null },
        { id: "s2", label: "ghost", laneId: "lane-sales", stepKind: "step", inferred: false, captureIds: [FAKE], metric: null },
      ],
    });
    const out = validateGraph(g, known);
    expect(out.steps.map((s) => s.id)).toEqual(["s1"]);
  });

  it("keeps an inferred step with no captures, but filters fake ids", () => {
    const g = graph({
      steps: [
        { id: "s1", label: "gap", laneId: "lane-sales", stepKind: "step", inferred: true, captureIds: [FAKE], metric: null },
      ],
    });
    const out = validateGraph(g, known);
    expect(out.steps).toHaveLength(1);
    expect(out.steps[0].captureIds).toEqual([]);
  });

  it("nulls a laneId that references a missing lane and prunes unused lanes", () => {
    const g = graph({
      lanes: [
        { id: "lane-sales", roleLabel: "Sales", department: null },
        { id: "lane-ghost", roleLabel: "Nobody", department: null },
      ],
      steps: [
        { id: "s1", label: "x", laneId: "lane-missing", stepKind: "step", inferred: false, captureIds: [C1], metric: null },
      ],
    });
    const out = validateGraph(g, known);
    expect(out.steps[0].laneId).toBeNull();
    expect(out.lanes).toEqual([]); // no surviving step references any lane
  });

  it("drops an edge whose endpoints don't both survive", () => {
    const g = graph({
      steps: [
        { id: "s1", label: "a", laneId: null, stepKind: "step", inferred: false, captureIds: [C1], metric: null },
        { id: "s2", label: "ghost", laneId: null, stepKind: "step", inferred: false, captureIds: [FAKE], metric: null },
      ],
      edges: [
        { id: "e1", from: "s1", to: "s2", edgeKind: "handoff", label: null, inferred: false, captureIds: [C2] },
      ],
    });
    const out = validateGraph(g, known);
    expect(out.steps.map((s) => s.id)).toEqual(["s1"]);
    expect(out.edges).toEqual([]);
  });

  it("drops an inferred edge whose both endpoints were dropped", () => {
    const g = graph({
      steps: [
        { id: "s1", label: "ghost-a", laneId: null, stepKind: "step", inferred: false, captureIds: [FAKE], metric: null },
        { id: "s2", label: "ghost-b", laneId: null, stepKind: "step", inferred: false, captureIds: [FAKE], metric: null },
      ],
      edges: [
        { id: "e1", from: "s1", to: "s2", edgeKind: "handoff", label: null, inferred: true, captureIds: [C1] },
      ],
    });
    const out = validateGraph(g, known);
    expect(out.steps).toEqual([]);
    expect(out.edges).toEqual([]);
  });

  it("returns structurally empty output for an empty graph without throwing", () => {
    const g = graph({ lanes: [], steps: [], edges: [] });
    const out = validateGraph(g, known);
    expect(out.steps).toEqual([]);
    expect(out.edges).toEqual([]);
    expect(out.lanes).toEqual([]);
  });
});
