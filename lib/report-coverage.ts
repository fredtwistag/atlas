import { DIMENSION_KEYS, type DimensionKey } from "@/services/llm/schemas";
import type { DimensionScore } from "./types";

/**
 * Report-relevant coverage metrics (EXT-4). The conversation-quality eval
 * (docs/03 §9) measures capture coverage/precision/probe-appropriateness, but
 * not whether the sprint captured what the REPORT needs. These pure functions
 * add that, computed from data Atlas already persists:
 *
 * - financialSignalCoverage: % of surfaced opportunities whose evidence backs
 *   the financial dimension with BOTH a frequency and a cost/time basis (so the
 *   dollar figure multiplies real numbers — see EXT-2).
 * - dimensionCoverage: % of surfaced opportunities scored on all five rubric
 *   dimensions with a non-zero score (a proxy for "each dimension is evidenced").
 *
 * Targets live in docs/03 §9; the >5pp weekly drift alert extends to these.
 */

/** Per-opportunity financial-evidence flags (from its quantified captures). */
export type FinancialSignal = {
  /** At least one supporting capture stated a frequency. */
  hasFrequency: boolean;
  /** At least one stated a direct dollar cost OR a time basis we can value. */
  hasCost: boolean;
};

/**
 * Fraction (0–1) of opportunities backed by BOTH frequency and cost. Empty
 * input → 0 (nothing to be confident about).
 */
export function financialSignalCoverage(signals: FinancialSignal[]): number {
  if (signals.length === 0) return 0;
  const backed = signals.filter((s) => s.hasFrequency && s.hasCost).length;
  return round(backed / signals.length);
}

/**
 * Fraction (0–1) of opportunities scored on every rubric dimension with a
 * non-zero score. Empty input → 0.
 */
export function dimensionCoverage(
  opportunities: { dimensionScores: DimensionScore[] }[],
): number {
  if (opportunities.length === 0) return 0;
  const complete = opportunities.filter((o) =>
    coversAllDimensions(o.dimensionScores),
  ).length;
  return round(complete / opportunities.length);
}

/** True when every rubric dimension is present with a score > 0. */
export function coversAllDimensions(scores: DimensionScore[]): boolean {
  const byKey = new Map<DimensionKey, number>();
  for (const s of scores) byKey.set(s.key as DimensionKey, s.score);
  return DIMENSION_KEYS.every((k) => (byKey.get(k) ?? 0) > 0);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
