import { describe, it, expect } from "vitest";
import { buildImpactEffort } from "./impact-effort";
import type { OpportunityPoint } from "./types";

const opps: OpportunityPoint[] = [
  { id: "o1", title: "Auto-sync ERP", impactHigh: 120000, timeToShipWeeksHigh: 3, horizon: "quick_win" },
  { id: "o2", title: "Self-serve refunds", impactHigh: 80000, timeToShipWeeksHigh: 8, horizon: "strategic_bet" },
];

describe("buildImpactEffort", () => {
  it("builds a metric-bearing step per opportunity with confidence 1", () => {
    const g = buildImpactEffort(opps);
    expect(g.kind).toBe("impact_effort");
    expect(g.steps).toHaveLength(2);
    expect(g.steps[0].label).toBe("Auto-sync ERP");
    expect(g.steps[0].metric).toEqual({ x: 3, y: 120000 });
    expect(g.steps[0].captureIds).toEqual([]);
    expect(g.confidence.score).toBe(1);
    expect(g.modelVersion).toBe("pure-ts");
  });
});
