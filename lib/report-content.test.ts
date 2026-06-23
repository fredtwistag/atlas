import { describe, it, expect } from "vitest";
import {
  HIGH_IMPACT_EUR,
  countHighImpact,
  highImpactLead,
  participationLine,
  corroborationLine,
  bucketLabel,
  narrativeFallback,
  selectPullQuotes,
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
  it("includes opportunities exactly at the band", () => {
    expect(countHighImpact([opp({ impactHigh: 75_000 })])).toBe(1);
  });
  it("uses the €75K high-impact band", () => {
    expect(HIGH_IMPACT_EUR).toBe(75_000);
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

describe("narrativeFallback", () => {
  it("builds a 2-sentence spine from the top opportunities", () => {
    const opps = [
      opp({ title: "Automate takeoff", impactLow: 56_000, impactHigh: 90_000 }),
      opp({ title: "Map ingestion", impactLow: 56_000, impactHigh: 75_000 }),
    ];
    const text = narrativeFallback({
      scopeDepartment: "Transversal",
      participantCount: 3,
      opportunitiesCount: 9,
      opps,
      totalLow: 178_000,
      totalHigh: 317_000,
      currency: "EUR",
    });
    expect(text).toContain("9 opportunities");
    expect(text).toContain("Automate takeoff");
    expect(text).toContain("€178K–€317K");
  });
  it("returns empty string when there are no opportunities", () => {
    expect(
      narrativeFallback({
        scopeDepartment: "X", participantCount: 0, opportunitiesCount: 0,
        opps: [], totalLow: 0, totalHigh: 0, currency: "EUR",
      }),
    ).toBe("");
  });
});

describe("selectPullQuotes", () => {
  const cap = (q: string, removed = false, edited = false) => ({
    id: q, kind: "bottleneck" as const, summary: "s", sourceQuote: q,
    contributorName: "Ana", contributorRole: "Controller",
    tags: [], isRemoved: removed, isEdited: edited,
  });
  it("takes verbatim, attributed quotes from the top opps, skipping removed/edited", () => {
    const opps = [
      opp({ title: "A", contributorCount: 4, evidence: [cap("real quote here")] }),
      opp({ title: "B", contributorCount: 2, evidence: [cap("removed", true), cap("edited", false, true)] }),
    ];
    const out = selectPullQuotes(opps, 2);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      quote: "real quote here", name: "Ana", role: "Controller",
      oppTitle: "A", corroboration: 4,
    });
  });
  it("returns [] when nothing qualifies", () => {
    expect(selectPullQuotes([opp({ evidence: [] })], 2)).toEqual([]);
  });
});

describe("content-rule guards", () => {
  it("the lead never emits a bare '0 high-impact' clause", () => {
    expect(highImpactLead(9, 0, "EUR")).not.toContain("0 of them");
    expect(highImpactLead(9, 0, "EUR")).not.toContain("high-impact");
  });
  it("participation framing never emits a vanity 100%", () => {
    expect(participationLine(3, "Transversal", 46)).not.toContain("%");
  });
});
