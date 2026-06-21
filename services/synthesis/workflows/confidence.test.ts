import { describe, it, expect } from "vitest";
import { scoreConfidence } from "./confidence";
import type { WorkflowCapture } from "./types";
import type { WorkflowGraphDraft } from "@/services/llm/schemas";

const C1 = "11111111-1111-4111-8111-111111111111";
const C2 = "22222222-2222-4222-8222-222222222222";

function cap(id: string, contributorId: string): WorkflowCapture {
  return { id, kind: "handoff", summary: "x", role: "Ops", department: null, contributorId };
}

function graph(captureIds: string[]): WorkflowGraphDraft {
  return {
    kind: "swimlane",
    title: "t",
    lanes: [],
    steps: [{ id: "s1", label: "a", laneId: null, stepKind: "step", inferred: false, captureIds, metric: null }],
    edges: [],
  };
}

describe("scoreConfidence", () => {
  it("counts an element as corroborated when ≥2 distinct contributors back it", () => {
    const caps = [cap(C1, "u1"), cap(C2, "u2")];
    const out = scoreConfidence(graph([C1, C2]), caps);
    expect(out.corroboratedCount).toBe(1);
    expect(out.coverage).toBe(1);
    expect(out.score).toBe(1);
  });

  it("does not corroborate a single-contributor element", () => {
    const caps = [cap(C1, "u1"), cap(C2, "u1")];
    const out = scoreConfidence(graph([C1, C2]), caps);
    expect(out.corroboratedCount).toBe(0);
    // coverage = 2/2 = 1, corroborationRatio = 0 → score = 0.5
    expect(out.score).toBeCloseTo(0.5, 5);
  });

  it("lowers coverage when most captures go unused", () => {
    const caps = [cap(C1, "u1"), cap(C2, "u2")];
    const out = scoreConfidence(graph([C1]), caps); // only 1 of 2 used
    expect(out.coverage).toBe(0.5);
  });
});
