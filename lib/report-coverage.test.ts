import { describe, it, expect } from "vitest";
import {
  financialSignalCoverage,
  dimensionCoverage,
  coversAllDimensions,
} from "./report-coverage";
import type { DimensionScore } from "./types";

const fullDims = (
  over: Partial<Record<string, number>> = {},
): DimensionScore[] =>
  (
    [
      "financial",
      "time_to_ship",
      "ai_suitability",
      "change_mgmt",
      "dependency",
    ] as const
  ).map((key) => ({
    key,
    label: key,
    score: over[key] ?? 6,
    reasoning: "x",
  }));

describe("financialSignalCoverage (EXT-4)", () => {
  it("counts only opportunities backed by BOTH frequency and cost", () => {
    const cov = financialSignalCoverage([
      { hasFrequency: true, hasCost: true },
      { hasFrequency: true, hasCost: false },
      { hasFrequency: false, hasCost: true },
      { hasFrequency: true, hasCost: true },
    ]);
    expect(cov).toBe(0.5); // 2 of 4
  });

  it("is 0 for an empty set", () => {
    expect(financialSignalCoverage([])).toBe(0);
  });
});

describe("dimensionCoverage (EXT-4)", () => {
  it("counts opportunities scored on all five dimensions (non-zero)", () => {
    const cov = dimensionCoverage([
      { dimensionScores: fullDims() },
      { dimensionScores: fullDims({ financial: 0 }) }, // a zero → not covered
      { dimensionScores: fullDims().slice(0, 4) }, // missing one → not covered
    ]);
    expect(cov).toBe(0.33); // 1 of 3
  });

  it("is 0 for an empty set", () => {
    expect(dimensionCoverage([])).toBe(0);
  });
});

describe("coversAllDimensions", () => {
  it("requires every dimension present and > 0", () => {
    expect(coversAllDimensions(fullDims())).toBe(true);
    expect(coversAllDimensions(fullDims({ dependency: 0 }))).toBe(false);
    expect(coversAllDimensions(fullDims().slice(0, 3))).toBe(false);
  });
});
