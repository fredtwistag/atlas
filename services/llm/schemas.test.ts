import { describe, it, expect } from "vitest";
import { companyEnrichment, opportunityScoring } from "./schemas";

const BASE_SCORING = {
  title: "Automate CPCV generation",
  description:
    "Generate the promissory contract from CRM data with a dedicated approval flow.",
  category: "Quote-to-cash",
  departments: ["Comercial", "Legal"],
  impactLow: 80_000,
  impactHigh: 140_000,
  timeToShipWeeksLow: 4,
  timeToShipWeeksHigh: 8,
  confidenceScore: 4,
  rationale:
    "Strong, corroborated signal from the commercial lead with quantified volume and a clear repetitive/bespoke split; the main uncertainty is the ERP boundary decision. Recommended next step: confirm whether generation lives in Business Central or an external layer.",
  delivery: "build" as const,
  deliveryRationale: "No off-the-shelf product fits the bespoke CPCV flow.",
  evidenceCaptureIds: ["11111111-1111-4111-8111-000000000001"],
};

const ARRAY_DIMS = [
  { key: "financial", score: 8, reasoning: "High recurring cost." },
  { key: "time_to_ship", score: 6, reasoning: "Moderate build." },
  { key: "ai_suitability", score: 5, reasoning: "Mostly workflow." },
  { key: "change_mgmt", score: 6, reasoning: "Few teams." },
  { key: "dependency", score: 5, reasoning: "Touches CRM." },
];

/**
 * The scorer prompt names the five dimensions, so the model sometimes returns
 * `dimensionScores` as an object keyed by dimension instead of the array the
 * schema wants. That shape quirk used to 500 the whole recompute (zero
 * opportunities surfaced). The schema must normalize it.
 */
describe("opportunityScoring (dimensionScores tolerance)", () => {
  it("accepts the canonical array form", () => {
    const out = opportunityScoring.parse({
      ...BASE_SCORING,
      dimensionScores: ARRAY_DIMS,
    });
    expect(out.dimensionScores).toHaveLength(5);
  });

  it("normalizes the object-keyed form the model actually emitted", () => {
    const out = opportunityScoring.parse({
      ...BASE_SCORING,
      dimensionScores: {
        financial: { score: 8, reasoning: "High recurring cost." },
        time_to_ship: { score: 6, reasoning: "Moderate build." },
        ai_suitability: { score: 5, reasoning: "Mostly workflow." },
        change_mgmt: { score: 6, reasoning: "Few teams." },
        dependency: { score: 5, reasoning: "Touches CRM." },
      },
    });
    expect(out.dimensionScores).toHaveLength(5);
    expect(new Set(out.dimensionScores.map((d) => d.key)).size).toBe(5);
    expect(out.dimensionScores.find((d) => d.key === "financial")?.score).toBe(
      8,
    );
  });

  it("still rejects a genuinely incomplete set", () => {
    expect(() =>
      opportunityScoring.parse({
        ...BASE_SCORING,
        dimensionScores: { financial: { score: 8, reasoning: "x" } },
      }),
    ).toThrow();
  });
});

/**
 * CTX-2 web-search output is advisory data a human reviews before it goes
 * `active`, and Claude's web-search replies are shape-variable. The schema must
 * accept realistic output (long descriptive bands, object-shaped systems)
 * rather than hard-fail the whole enrichment on a shape/length quirk.
 */
describe("companyEnrichment (CTX-2 tolerance)", () => {
  it("accepts a fully-populated, well-shaped profile", () => {
    const out = companyEnrichment.parse({
      summary: "A 3PL logistics operator.",
      industry: "Logistics",
      businessModel: "B2B 3PL",
      sizeBand: "200-500 employees",
      revenueBand: "$50M-$100M",
      maturity: "PE-backed",
      keySystems: ["NetSuite", "Salesforce"],
      knownPains: ["manual quoting"],
      sources: [{ label: "site", ref: "https://x.com" }],
    });
    expect(out.keySystems).toEqual(["NetSuite", "Salesforce"]);
    expect(out.sizeBand).toBe("200-500 employees");
  });

  it("accepts descriptive bands longer than the old 60-char cap", () => {
    const longBand =
      "Estimated 200-500 employees globally, ~300 concentrated in fulfilment operations";
    const out = companyEnrichment.parse({ sizeBand: longBand });
    expect(out.sizeBand).toBe(longBand);
  });

  it("coerces object-shaped keySystems entries to strings (the real failure)", () => {
    const out = companyEnrichment.parse({
      keySystems: [{ name: "SAP S/4HANA" }, "Salesforce", { system: "WMS" }],
    });
    expect(out.keySystems).toEqual(["SAP S/4HANA", "Salesforce", "WMS"]);
  });

  it("stringifies a system object with no name-like key instead of failing", () => {
    const out = companyEnrichment.parse({ keySystems: [{ foo: "bar" }] });
    expect(out.keySystems[0]).toContain("foo");
  });

  it("clamps an absurdly long entry rather than rejecting the whole profile", () => {
    const huge = "x".repeat(500);
    const out = companyEnrichment.parse({ keySystems: [huge] });
    expect(out.keySystems[0].length).toBeLessThanOrEqual(120);
  });

  it("defaults null/empty arrays for an absent or null-ish profile", () => {
    const out = companyEnrichment.parse({
      keySystems: null,
      knownPains: undefined,
    });
    expect(out.keySystems).toEqual([]);
    expect(out.knownPains).toEqual([]);
    expect(out.summary).toBeNull();
  });
});
