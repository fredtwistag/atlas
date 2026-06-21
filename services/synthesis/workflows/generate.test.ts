import { describe, it, expect, vi, beforeEach } from "vitest";

const completeStructured = vi.fn();
vi.mock("@/services/llm/client", () => ({
  completeStructured: (...args: unknown[]) => completeStructured(...args),
}));

import { generateGraph, critiqueGraph } from "./generate";
import type { WorkflowCapture } from "./types";

const C1 = "11111111-1111-4111-8111-111111111111";

function cap(p: Partial<WorkflowCapture>): WorkflowCapture {
  return {
    id: C1,
    kind: "handoff",
    summary: "Sales emails the deal to ops",
    role: "Sales rep",
    department: "Sales",
    contributorId: "SECRET-USER-ID",
    ...p,
  };
}

beforeEach(() => completeStructured.mockReset());

describe("generateGraph", () => {
  it("returns null without an LLM call when no relevant captures", async () => {
    const out = await generateGraph("swimlane", [cap({ kind: "frustration" })], ["Sales rep"]);
    expect(out).toBeNull();
    expect(completeStructured).not.toHaveBeenCalled();
  });

  it("never sends contributorId (or names) to the model, but does send role", async () => {
    completeStructured.mockResolvedValue({ kind: "swimlane", title: "t", lanes: [], steps: [], edges: [] });
    await generateGraph("swimlane", [cap({})], ["Sales rep"]);
    const content = completeStructured.mock.calls[0][0].messages[0].content as string;
    expect(content).toContain(C1);
    expect(content).toContain("Sales rep");
    expect(content).not.toContain("SECRET-USER-ID");
  });

  it("forces the returned kind to the requested kind", async () => {
    completeStructured.mockResolvedValue({ kind: "decision_flow", title: "t", lanes: [], steps: [], edges: [] });
    const out = await generateGraph("swimlane", [cap({})], ["Sales rep"]);
    expect(out?.kind).toBe("swimlane");
  });
});

describe("critiqueGraph", () => {
  it("returns the unsupported ids the model flags", async () => {
    completeStructured.mockResolvedValue({ unsupportedStepIds: ["s2"], unsupportedEdgeIds: [] });
    const out = await critiqueGraph(
      {
        kind: "swimlane",
        title: "t",
        lanes: [],
        steps: [{ id: "s2", label: "x", laneId: null, stepKind: "step", inferred: false, captureIds: [C1], metric: null }],
        edges: [],
      },
      [cap({})],
    );
    expect(out.unsupportedStepIds).toEqual(["s2"]);
  });

  it("never sends contributorId to the model, but does send capture summary as evidence", async () => {
    completeStructured.mockResolvedValue({ unsupportedStepIds: [], unsupportedEdgeIds: [] });
    const captureSummary = "Sales emails the deal to ops";
    await critiqueGraph(
      {
        kind: "swimlane",
        title: "t",
        lanes: [],
        steps: [{ id: "s1", label: "x", laneId: null, stepKind: "step", inferred: false, captureIds: [C1], metric: null }],
        edges: [],
      },
      [cap({ summary: captureSummary })],
    );
    const content = completeStructured.mock.calls[0][0].messages[0].content as string;
    expect(content).toContain(captureSummary);
    expect(content).not.toContain("SECRET-USER-ID");
  });
});
