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

import { scoreCluster, computeComposite } from "./score";

const ID = {
  a: "11111111-1111-4111-8111-111111111111",
  b: "22222222-2222-4222-8222-222222222222",
};

function fullScoring(over: Partial<OpportunityScoring> = {}): OpportunityScoring {
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
