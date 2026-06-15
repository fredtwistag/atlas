import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  opportunityScoring,
  type OpportunityScoring,
} from "@/services/llm/schemas";
import type { ScoreCapture } from "./score";

// Mock the LLM layer: completeStructured returns whatever the test queues.
const completeStructured = vi.fn();
vi.mock("@/services/llm/client", () => ({
  completeStructured: (...args: unknown[]) => completeStructured(...args),
}));

import {
  scoreCluster,
  computeComposite,
  rateForRole,
  impliedAnnualUsd,
  DEFAULT_LOADED_HOURLY_USD,
} from "./score";

const ID = {
  a: "11111111-1111-4111-8111-111111111111",
  b: "22222222-2222-4222-8222-222222222222",
};

function fullScoring(
  over: Partial<OpportunityScoring> = {},
): OpportunityScoring {
  return {
    title: "Automate pricing pre-approval",
    description:
      "Custom enterprise pricing waits days for VP sign-off; AEs ship list price.",
    category: "Pricing ops",
    departments: ["Sales", "Finance"],
    impactLow: 200_000,
    impactHigh: 500_000,
    timeToShipWeeksLow: 3,
    timeToShipWeeksHigh: 4,
    confidenceScore: 4,
    dimensionScores: [
      { key: "financial", score: 8, reasoning: "x" },
      { key: "time_to_ship", score: 7, reasoning: "x" },
      { key: "ai_suitability", score: 6, reasoning: "x" },
      { key: "change_mgmt", score: 7, reasoning: "x" },
      { key: "dependency", score: 8, reasoning: "x" },
    ],
    rationale:
      "VP Sales gates custom pricing; quotes wait 2-4 days. Two AEs and one ops lead corroborate. Main uncertainty: share auto-routable. Recommended next step: Approve for FDE.",
    evidenceCaptureIds: [ID.a, ID.b],
    ...over,
  };
}

function cap(id: string): ScoreCapture {
  return {
    id,
    kind: "bottleneck",
    summary: "Pricing approvals are slow.",
    sourceQuote: "we wait days for pricing sign-off",
    role: "Account Executive",
    department: "Sales",
  };
}

beforeEach(() => {
  completeStructured.mockReset();
});

describe("computeComposite", () => {
  it("computes the rubric-weighted composite rounded to 1 decimal", () => {
    // 0.30*8 + 0.15*7 + 0.20*6 + 0.15*7 + 0.20*8 = 2.4+1.05+1.2+1.05+1.6 = 7.3
    const composite = computeComposite([
      { key: "financial", score: 8 },
      { key: "time_to_ship", score: 7 },
      { key: "ai_suitability", score: 6 },
      { key: "change_mgmt", score: 7 },
      { key: "dependency", score: 8 },
    ]);
    expect(composite).toBe(7.3);
  });

  it("rounds half-up to one decimal", () => {
    // all 5s -> 0.30*5+0.15*5+0.20*5+0.15*5+0.20*5 = 5.0
    const composite = computeComposite([
      { key: "financial", score: 5 },
      { key: "time_to_ship", score: 5 },
      { key: "ai_suitability", score: 5 },
      { key: "change_mgmt", score: 5 },
      { key: "dependency", score: 5 },
    ]);
    expect(composite).toBe(5.0);
  });
});

describe("rateForRole (EXT-2)", () => {
  it("prefers the role-specific rate, then default, then the benchmark", () => {
    const basis = { "Account Executive": 65, default: 90 };
    expect(rateForRole("Account Executive", basis)).toBe(65);
    expect(rateForRole("Ops Lead", basis)).toBe(90); // default key
    expect(rateForRole("Ops Lead", { "Account Executive": 65 })).toBe(
      DEFAULT_LOADED_HOURLY_USD,
    );
    expect(rateForRole("anyone", null)).toBe(DEFAULT_LOADED_HOURLY_USD);
  });
});

describe("impliedAnnualUsd (EXT-2)", () => {
  it("uses a direct dollar cost × frequency when given", () => {
    expect(
      impliedAnnualUsd(
        {
          frequencyPerYear: 100,
          unitMinutes: null,
          unitCostUsd: 250,
          basis: null,
        },
        75,
      ),
    ).toBe(25_000);
  });

  it("values time at the hourly rate when no dollar cost is given", () => {
    // 104×/yr × 30 min × $80/hr = 104 * 0.5 * 80 = 4160
    expect(
      impliedAnnualUsd(
        {
          frequencyPerYear: 104,
          unitMinutes: 30,
          unitCostUsd: null,
          basis: null,
        },
        80,
      ),
    ).toBe(4_160);
  });

  it("returns null without enough to compute (no frequency, or no cost/time)", () => {
    expect(impliedAnnualUsd(null, 75)).toBeNull();
    expect(
      impliedAnnualUsd(
        {
          frequencyPerYear: null,
          unitMinutes: 30,
          unitCostUsd: null,
          basis: null,
        },
        75,
      ),
    ).toBeNull();
    expect(
      impliedAnnualUsd(
        {
          frequencyPerYear: 50,
          unitMinutes: null,
          unitCostUsd: null,
          basis: null,
        },
        75,
      ),
    ).toBeNull();
  });
});

describe("scoreCluster — financial grounding (EXT-2)", () => {
  it("passes a TS-computed implied annual and the cost basis into the prompt", async () => {
    completeStructured.mockResolvedValue(fullScoring());
    const quantified = cap(ID.a);
    quantified.quantifiedImpact = {
      frequencyPerYear: 104,
      unitMinutes: 30,
      unitCostUsd: null,
      basis: "twice a week, half an hour each",
    };

    await scoreCluster({
      theme: "Pricing approval delay",
      tenantName: "Northwind",
      captures: [quantified, cap(ID.b)],
      costBasis: { "Account Executive": 80 },
    });

    const content = completeStructured.mock.calls[0][0].messages[0]
      .content as string;
    // 104 × 0.5h × $80 = $4,160 — computed in TS, embedded in the prompt.
    expect(content).toContain("implied annual ≈ $4,160");
    expect(content).toContain("Account Executive $80/hr");
  });

  it("includes the company profile in the prompt when provided (CTX-4)", async () => {
    completeStructured.mockResolvedValue(fullScoring());
    await scoreCluster({
      theme: "T",
      tenantName: "Northwind",
      captures: [cap(ID.a), cap(ID.b)],
      companyProfile: {
        industry: "Wholesale distribution",
        sizeBand: "200-500",
      },
    });
    const content = completeStructured.mock.calls[0][0].messages[0]
      .content as string;
    expect(content).toContain(
      "BUSINESS PROFILE: Wholesale distribution, 200-500",
    );
  });

  it("falls back to the benchmark note when no cost basis is provided", async () => {
    completeStructured.mockResolvedValue(fullScoring());
    await scoreCluster({
      theme: "T",
      tenantName: "Northwind",
      captures: [cap(ID.a), cap(ID.b)],
    });
    const content = completeStructured.mock.calls[0][0].messages[0]
      .content as string;
    expect(content).toContain(`$${DEFAULT_LOADED_HOURLY_USD}/hr`);
  });
});

describe("scoreCluster", () => {
  it("computes composite in TS and returns the validated scoring", async () => {
    completeStructured.mockResolvedValue(fullScoring());

    const out = await scoreCluster({
      theme: "Pricing approval delay",
      tenantName: "Northwind",
      captures: [cap(ID.a), cap(ID.b)],
    });

    expect(out.composite).toBe(7.3);
    expect(out.scoring.title).toBe("Automate pricing pre-approval");
  });

  it("filters evidenceCaptureIds down to real input captures", async () => {
    const fake = "99999999-9999-4999-8999-999999999999";
    completeStructured.mockResolvedValue(
      fullScoring({ evidenceCaptureIds: [ID.a, fake] }),
    );

    const out = await scoreCluster({
      theme: "T",
      tenantName: "Northwind",
      captures: [cap(ID.a), cap(ID.b)],
    });

    expect(out.scoring.evidenceCaptureIds).toEqual([ID.a]);
  });

  it("falls back to the whole cluster when the model cites only unknown ids", async () => {
    const fake = "99999999-9999-4999-8999-999999999999";
    completeStructured.mockResolvedValue(
      fullScoring({ evidenceCaptureIds: [fake] }),
    );

    const out = await scoreCluster({
      theme: "T",
      tenantName: "Northwind",
      captures: [cap(ID.a), cap(ID.b)],
    });

    expect(out.scoring.evidenceCaptureIds.sort()).toEqual([ID.a, ID.b].sort());
  });

  it("does not leak any capture sourceQuote to console", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    completeStructured.mockResolvedValue(fullScoring());

    await scoreCluster({
      theme: "T",
      tenantName: "Northwind",
      captures: [cap(ID.a)],
    });

    for (const call of log.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("pricing sign-off");
    }
    log.mockRestore();
  });
});

// The bounds (impactLow<=impactHigh, all 5 dimension keys, low<=high weeks) are
// enforced by the Zod schema itself — completeStructured retries once on a
// schema failure (see services/llm/client.ts). These assertions prove the
// contract the scorer relies on.
describe("opportunityScoring schema (scorer's contract)", () => {
  it("rejects impactLow > impactHigh", () => {
    const bad = fullScoring({ impactLow: 500_000, impactHigh: 1_000 });
    expect(opportunityScoring.safeParse(bad).success).toBe(false);
  });

  it("rejects timeToShipWeeksLow > timeToShipWeeksHigh", () => {
    const bad = fullScoring({ timeToShipWeeksLow: 8, timeToShipWeeksHigh: 2 });
    expect(opportunityScoring.safeParse(bad).success).toBe(false);
  });

  it("rejects a missing dimension key", () => {
    const bad = fullScoring({
      dimensionScores: [
        { key: "financial", score: 8, reasoning: "x" },
        { key: "time_to_ship", score: 7, reasoning: "x" },
        { key: "ai_suitability", score: 6, reasoning: "x" },
        { key: "change_mgmt", score: 7, reasoning: "x" },
        // dependency omitted
      ],
    });
    expect(opportunityScoring.safeParse(bad).success).toBe(false);
  });

  it("rejects a duplicate dimension key", () => {
    const bad = fullScoring({
      dimensionScores: [
        { key: "financial", score: 8, reasoning: "x" },
        { key: "financial", score: 7, reasoning: "x" },
        { key: "ai_suitability", score: 6, reasoning: "x" },
        { key: "change_mgmt", score: 7, reasoning: "x" },
        { key: "dependency", score: 8, reasoning: "x" },
      ],
    });
    expect(opportunityScoring.safeParse(bad).success).toBe(false);
  });

  it("accepts a fully valid scoring", () => {
    expect(opportunityScoring.safeParse(fullScoring()).success).toBe(true);
  });
});
