import { describe, it, expect } from "vitest";
import { computeProgress, toOpportunity } from "./dashboard-map";

describe("computeProgress", () => {
  it("computes completion %, active contributors, and high-impact count", () => {
    const p = computeProgress({
      participants: [
        { sessionsCompleted: 4, sessionsTotal: 4, status: "completed" },
        { sessionsCompleted: 2, sessionsTotal: 4, status: "in_progress" },
        { sessionsCompleted: 0, sessionsTotal: 4, status: "not_started" },
      ],
      opportunities: [
        { compositeScore: 8.7, impactHigh: 90_000 },
        { compositeScore: 6.1, impactHigh: 40_000 },
      ],
      capturesCount: 12,
      signalQuality: 4.6,
    });
    expect(p.sessionsCompleted).toBe(6);
    expect(p.sessionsTotal).toBe(12);
    expect(p.completionPct).toBe(50);
    expect(p.weeklyActiveContributors).toBe(2);
    expect(p.participantCount).toBe(3);
    expect(p.opportunitiesCount).toBe(2);
    expect(p.highImpactCount).toBe(1); // only the €90K opp clears the €75K band
    expect(p.capturesCount).toBe(12);
    expect(p.signalQuality).toBe(4.6);
  });
});

describe("toOpportunity", () => {
  it("coerces the numeric composite score from string", () => {
    const o = toOpportunity(
      {
        id: "o1",
        sprintId: "s1",
        title: "T",
        description: "d",
        category: "c",
        departments: ["Finance"],
        impactLow: 1,
        impactHigh: 2,
        timeToShipWeeksLow: 1,
        timeToShipWeeksHigh: 2,
        confidenceScore: 5,
        compositeScore: "8.7",
        horizon: "standard",
        delivery: "build",
        deliveryRationale: "",
        dimensionScores: [
          { key: "impact", label: "Impact", score: 9, reasoning: "r" },
        ],
        rationale: "why",
        status: "surfaced",
        contributorCount: 3,
        patternMatch: null,
      },
      [],
    );
    expect(o.compositeScore).toBe(8.7);
    expect(typeof o.compositeScore).toBe("number");
    expect(o.dimensionScores).toHaveLength(1);
    expect(o.patternMatch).toBeUndefined();
  });
});
