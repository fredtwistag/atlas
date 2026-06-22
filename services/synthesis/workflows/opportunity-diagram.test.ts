import { describe, it, expect, vi, beforeEach } from "vitest";
import { chooseOpportunityKind } from "./opportunity-diagram";
import type { WorkflowCapture } from "./types";

const generateGraph = vi.fn();
vi.mock("./generate", async () => {
  const actual = await vi.importActual<typeof import("./generate")>("./generate");
  return { ...actual, generateGraph: (...a: unknown[]) => generateGraph(...a) };
});

import { generateOpportunityDiagram } from "./opportunity-diagram";

const cap = (kind: string): WorkflowCapture => ({
  id: "x", kind, summary: "s", role: "Ops", department: null, contributorId: "u",
});

describe("chooseOpportunityKind", () => {
  it("picks systems_topology when tooling/workaround outnumber process kinds", () => {
    expect(chooseOpportunityKind([cap("tooling"), cap("tooling"), cap("workaround"), cap("handoff")])).toBe("systems_topology");
  });
  it("picks swimlane when process kinds dominate", () => {
    expect(chooseOpportunityKind([cap("bottleneck"), cap("handoff"), cap("sop"), cap("tooling")])).toBe("swimlane");
  });
  it("defaults to swimlane on a tie or empty", () => {
    expect(chooseOpportunityKind([cap("tooling"), cap("bottleneck")])).toBe("swimlane");
    expect(chooseOpportunityKind([])).toBe("swimlane");
  });
});

const C1 = "11111111-1111-4111-8111-111111111111";
const C2 = "22222222-2222-4222-8222-222222222222";
const ev = (id: string, contributorId: string): WorkflowCapture => ({ id, kind: "bottleneck", summary: "manual step", role: "Ops", department: null, contributorId });

beforeEach(() => { generateGraph.mockReset(); });

describe("generateOpportunityDiagram", () => {
  it("returns a confidence-scored graph for a grounded opportunity diagram", async () => {
    generateGraph.mockResolvedValue({
      kind: "swimlane", title: "Current state", lanes: [],
      steps: [
        { id: "s1", label: "Log deal", laneId: null, stepKind: "step", inferred: false, captureIds: [C1], metric: null },
        { id: "s2", label: "Re-key", laneId: null, stepKind: "bottleneck", inferred: false, captureIds: [C2], metric: null },
      ],
      edges: [{ id: "e1", from: "s1", to: "s2", edgeKind: "flow", label: null, inferred: false, captureIds: [C1, C2] }],
    });
    const out = await generateOpportunityDiagram({ title: "Automate re-keying" }, [ev(C1, "u1"), ev(C2, "u2")], ["Ops"], "m");
    expect(out).not.toBeNull();
    expect(out!.confidence.score).toBeGreaterThanOrEqual(0.3);
    expect(out!.modelVersion).toBe("m");
  });
  it("returns null when generation throws", async () => {
    generateGraph.mockRejectedValue(new Error("LLM down"));
    expect(await generateOpportunityDiagram({ title: "x" }, [ev(C1, "u1")], [], "m")).toBeNull();
  });
  it("returns null when validation leaves it under the minimum", async () => {
    generateGraph.mockResolvedValue({ kind: "swimlane", title: "t", lanes: [], steps: [{ id: "s1", label: "ghost", laneId: null, stepKind: "step", inferred: false, captureIds: ["bad"], metric: null }], edges: [] });
    expect(await generateOpportunityDiagram({ title: "x" }, [ev(C1, "u1")], [], "m")).toBeNull();
  });
});
