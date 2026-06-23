import { describe, it, expect } from "vitest";
import {
  HIGH_IMPACT_EUR,
  countHighImpact,
  highImpactLead,
  participationLine,
  corroborationLine,
  bucketLabel,
} from "./report-content";
import type { Opportunity } from "./types";

function opp(p: Partial<Opportunity>): Opportunity {
  return {
    id: "o", sprintId: "s", title: "T", description: "", category: "Ops",
    departments: [], impactLow: 10_000, impactHigh: 20_000,
    timeToShipWeeksLow: 3, timeToShipWeeksHigh: 5, confidenceScore: 4,
    compositeScore: 6, horizon: "standard", delivery: "build",
    deliveryRationale: "", dimensionScores: [], rationale: "",
    status: "surfaced", evidence: [], contributorCount: 3, ...p,
  };
}

describe("countHighImpact", () => {
  it("counts opps whose high estimate clears the band", () => {
    const opps = [opp({ impactHigh: 90_000 }), opp({ impactHigh: 75_000 }), opp({ impactHigh: 60_000 })];
    expect(countHighImpact(opps)).toBe(2);
  });
});

describe("highImpactLead", () => {
  it("phrases a non-zero count around the money band", () => {
    expect(highImpactLead(9, 3, "EUR")).toBe(
      "9 opportunities, 3 of them estimated at €75K+/yr each",
    );
  });
  it("never leads with a zero — falls back to the count alone", () => {
    expect(highImpactLead(9, 0, "EUR")).toBe("9 opportunities");
  });
  it("uses the singular for one high-impact opportunity", () => {
    expect(highImpactLead(5, 1, "EUR")).toBe(
      "5 opportunities, 1 of them estimated at €75K+/yr",
    );
  });
});

describe("participationLine", () => {
  it("states real n + captures, no vanity percentage", () => {
    expect(participationLine(3, "Transversal", 46)).toBe(
      "3 contributors across Transversal · 46 captures",
    );
  });
});

describe("corroborationLine", () => {
  it("states the minimum corroboration honestly", () => {
    const opps = [opp({ contributorCount: 2 }), opp({ contributorCount: 5 })];
    expect(corroborationLine(opps)).toBe(
      "Every opportunity shown is corroborated by at least two contributors.",
    );
  });
  it("returns empty string when there are no opportunities", () => {
    expect(corroborationLine([])).toBe("");
  });
});

describe("bucketLabel", () => {
  it("maps horizon to the unified taxonomy", () => {
    expect(bucketLabel("quick_win")).toBe("Quick wins");
    expect(bucketLabel("standard")).toBe("Solid bets");
    expect(bucketLabel("strategic_bet")).toBe("Strategic bets");
  });
});
