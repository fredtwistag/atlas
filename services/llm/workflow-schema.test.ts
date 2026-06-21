import { describe, it, expect } from "vitest";
import { workflowGraphDraft, workflowCritique } from "./schemas";

describe("workflowGraphDraft", () => {
  it("applies defaults for omitted optional fields", () => {
    const parsed = workflowGraphDraft.parse({
      kind: "swimlane",
      title: "Deal to order",
      steps: [{ id: "s1", label: "Log deal", stepKind: "step" }],
    });
    expect(parsed.lanes).toEqual([]);
    expect(parsed.edges).toEqual([]);
    expect(parsed.steps[0].captureIds).toEqual([]);
    expect(parsed.steps[0].inferred).toBe(false);
    expect(parsed.steps[0].laneId).toBeNull();
    expect(parsed.steps[0].metric).toBeNull();
  });

  it("rejects a graph with zero steps", () => {
    const r = workflowGraphDraft.safeParse({ kind: "swimlane", title: "x", steps: [] });
    expect(r.success).toBe(false);
  });

  it("rejects a non-uuid captureId", () => {
    const r = workflowGraphDraft.safeParse({
      kind: "swimlane",
      title: "x",
      steps: [{ id: "s1", label: "y", stepKind: "step", captureIds: ["not-a-uuid"] }],
    });
    expect(r.success).toBe(false);
  });
});

describe("workflowCritique", () => {
  it("defaults both arrays to empty", () => {
    expect(workflowCritique.parse({})).toEqual({
      unsupportedStepIds: [],
      unsupportedEdgeIds: [],
    });
  });
});
