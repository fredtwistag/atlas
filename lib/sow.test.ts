import { describe, it, expect } from "vitest";
import { buildSowDraft } from "./sow";
import type { Opportunity } from "./types";

const opp = {
  id: "o1",
  sprintId: "s1",
  title: "Automate credit-hold release",
  description: "x",
  category: "Order-to-cash",
  departments: ["Finance"],
  impactLow: 1,
  impactHigh: 2,
  timeToShipWeeksLow: 3,
  timeToShipWeeksHigh: 5,
  confidenceScore: 5,
  compositeScore: 8.7,
  dimensionScores: [],
  rationale: "r",
  status: "surfaced",
  evidence: [],
  contributorCount: 5,
} as Opportunity;

describe("buildSowDraft", () => {
  it("derives title/scope/duration/price from the opportunity + tenant", () => {
    const sow = buildSowDraft(opp, "Northwind Logistics");
    expect(sow.title).toContain("Automate credit-hold release");
    expect(sow.scope).toContain("Northwind Logistics");
    expect(sow.durationWeeks).toBe(5); // timeToShipWeeksHigh
    expect(sow.priceUsd).toBeGreaterThan(0);
    expect(sow.inclusions.length).toBeGreaterThan(0);
    expect(sow.successMetrics.length).toBeGreaterThan(0);
    expect(sow.team.length).toBeGreaterThan(0);
  });
});
