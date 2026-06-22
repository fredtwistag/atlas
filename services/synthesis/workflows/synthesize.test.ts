import { describe, it, expect } from "vitest";
import { synthesizeWorkflows } from "./synthesize";
import type { OpportunityPoint, WorkflowCapture } from "./types";

const opp = (id: string): OpportunityPoint => ({ id, title: id, impactHigh: 1, timeToShipWeeksHigh: 1, horizon: "standard" });
const caps: WorkflowCapture[] = [];

describe("synthesizeWorkflows (sprint-level)", () => {
  it("emits only the impact_effort matrix when there are >=3 opportunities", async () => {
    const out = await synthesizeWorkflows({ captures: caps, opportunities: [opp("a"), opp("b"), opp("c")], roleLabels: [], modelVersion: "m" });
    expect(out.map((g) => g.kind)).toEqual(["impact_effort"]);
  });
  it("emits nothing with fewer than 3 opportunities", async () => {
    const out = await synthesizeWorkflows({ captures: caps, opportunities: [opp("a")], roleLabels: [], modelVersion: "m" });
    expect(out).toEqual([]);
  });
});
