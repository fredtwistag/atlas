import { describe, it, expect, vi, beforeEach } from "vitest";

const generateGraph = vi.fn();
const critiqueGraph = vi.fn();
vi.mock("./generate", () => ({
  generateGraph: (...a: unknown[]) => generateGraph(...a),
  critiqueGraph: (...a: unknown[]) => critiqueGraph(...a),
  KIND_PROMPTS: {},
}));

import { synthesizeWorkflows } from "./synthesize";
import type { WorkflowCapture, OpportunityPoint } from "./types";

const C1 = "11111111-1111-4111-8111-111111111111";
const C2 = "22222222-2222-4222-8222-222222222222";

function cap(id: string, contributorId: string): WorkflowCapture {
  return { id, kind: "handoff", summary: "x", role: "Ops", department: null, contributorId };
}

const swimlaneCaps: WorkflowCapture[] = [
  { id: C1, kind: "handoff", summary: "sales hands to ops", role: "Sales rep", department: "Sales", contributorId: "u1" },
  { id: C2, kind: "sop", summary: "ops re-keys", role: "Ops", department: "Ops", contributorId: "u2" },
  { id: "33333333-3333-4333-8333-333333333333", kind: "decision", summary: "finance signs", role: "Finance", department: "Finance", contributorId: "u3" },
];

const opps: OpportunityPoint[] = [
  { id: "o1", title: "A", impactHigh: 1, timeToShipWeeksHigh: 1, horizon: "quick_win" },
  { id: "o2", title: "B", impactHigh: 2, timeToShipWeeksHigh: 2, horizon: "standard" },
  { id: "o3", title: "C", impactHigh: 3, timeToShipWeeksHigh: 3, horizon: "strategic_bet" },
];

beforeEach(() => {
  generateGraph.mockReset();
  critiqueGraph.mockReset();
  critiqueGraph.mockResolvedValue({ unsupportedStepIds: [], unsupportedEdgeIds: [] });
});

describe("synthesizeWorkflows", () => {
  it("always emits a pure-TS impact_effort matrix when ≥3 opportunities", async () => {
    const out = await synthesizeWorkflows({ captures: [], opportunities: opps, roleLabels: [], modelVersion: "m" });
    expect(out.map((g) => g.kind)).toContain("impact_effort");
    expect(generateGraph).not.toHaveBeenCalled(); // no swimlane-eligible captures
  });

  it("keeps a well-grounded, corroborated swimlane", async () => {
    generateGraph.mockResolvedValue({
      kind: "swimlane",
      title: "Deal to order",
      lanes: [{ id: "l1", roleLabel: "Sales", department: "Sales" }],
      steps: [
        { id: "s1", label: "Log deal", laneId: "l1", stepKind: "step", inferred: false, captureIds: [C1], metric: null },
        { id: "s2", label: "Re-key", laneId: "l1", stepKind: "step", inferred: false, captureIds: [C2], metric: null },
      ],
      edges: [
        { id: "e1", from: "s1", to: "s2", edgeKind: "handoff", label: null, inferred: false, captureIds: [C1, C2] },
      ],
    });
    const out = await synthesizeWorkflows({ captures: swimlaneCaps, opportunities: [], roleLabels: ["Sales"], modelVersion: "m" });
    const sw = out.find((g) => g.kind === "swimlane");
    expect(sw).toBeDefined();
    expect(sw!.confidence.score).toBeGreaterThanOrEqual(0.3);
    expect(sw!.modelVersion).toBe("m");
  });

  it("abstains when the critic strips it below the minimum step count", async () => {
    generateGraph.mockResolvedValue({
      kind: "swimlane",
      title: "t",
      lanes: [],
      steps: [{ id: "s1", label: "x", laneId: null, stepKind: "step", inferred: false, captureIds: [C1], metric: null }],
      edges: [],
    });
    critiqueGraph.mockResolvedValue({ unsupportedStepIds: ["s1"], unsupportedEdgeIds: [] });
    const out = await synthesizeWorkflows({ captures: swimlaneCaps, opportunities: [], roleLabels: [], modelVersion: "m" });
    expect(out.find((g) => g.kind === "swimlane")).toBeUndefined();
  });

  it("skips a kind whose generation throws, without failing the batch", async () => {
    generateGraph.mockRejectedValue(new Error("LLM down"));
    const out = await synthesizeWorkflows({ captures: swimlaneCaps, opportunities: opps, roleLabels: [], modelVersion: "m" });
    expect(out.map((g) => g.kind)).toEqual(["impact_effort"]);
  });
});
