import { describe, it, expect } from "vitest";
import { chooseOpportunityKind } from "./opportunity-diagram";
import type { WorkflowCapture } from "./types";

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
