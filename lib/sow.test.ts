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

  // BOUNDARY CASES (plan 027 Step 4). The SOW draft feeds a client-facing
  // engagement quote, so price/duration must stay in sane bounds even when the
  // opportunity carries degenerate or extreme inputs. Today price is a fixed
  // template constant and duration tracks timeToShipWeeksHigh — these lock that
  // contract so a future "scale price by impact" change can't silently produce
  // a $0 or 200-week SOW without a red test.
  const PRICE_FLOOR = 1_000;
  const PRICE_CEILING = 10_000_000;
  const WEEKS_CEILING = 52;

  it("keeps price/duration in sane bounds for a tiny opportunity", () => {
    // Smallest meaningful opportunity: 1-week ship, near-zero impact.
    const tiny = {
      ...opp,
      impactLow: 0,
      impactHigh: 0,
      timeToShipWeeksLow: 1,
      timeToShipWeeksHigh: 1,
    } as Opportunity;
    const sow = buildSowDraft(tiny, "Acme");
    expect(sow.durationWeeks).toBe(1);
    expect(sow.priceUsd).toBeGreaterThanOrEqual(PRICE_FLOOR);
    expect(sow.priceUsd).toBeLessThanOrEqual(PRICE_CEILING);
  });

  it("keeps price/duration in sane bounds for an extreme-impact opportunity", () => {
    // Pathologically large impact + long ship window must not blow the bounds.
    const huge = {
      ...opp,
      impactLow: 5_000_000,
      impactHigh: 50_000_000,
      timeToShipWeeksLow: 40,
      timeToShipWeeksHigh: 52,
    } as Opportunity;
    const sow = buildSowDraft(huge, "Globex");
    expect(sow.durationWeeks).toBeGreaterThan(0);
    expect(sow.durationWeeks).toBeLessThanOrEqual(WEEKS_CEILING);
    expect(sow.priceUsd).toBeGreaterThanOrEqual(PRICE_FLOOR);
    expect(sow.priceUsd).toBeLessThanOrEqual(PRICE_CEILING);
  });

  it("produces a non-empty, well-formed draft even with empty string fields", () => {
    // Degenerate text inputs (empty title) must still yield a structurally
    // valid draft — no crash, all list fields populated.
    const blank = { ...opp, title: "" } as Opportunity;
    const sow = buildSowDraft(blank, "");
    expect(typeof sow.title).toBe("string");
    expect(sow.scope.length).toBeGreaterThan(0);
    expect(sow.inclusions.length).toBeGreaterThan(0);
    expect(sow.exclusions.length).toBeGreaterThan(0);
    expect(sow.team.length).toBeGreaterThan(0);
    expect(sow.successMetrics.length).toBeGreaterThan(0);
    expect(sow.priceUsd).toBeGreaterThanOrEqual(PRICE_FLOOR);
  });
});
