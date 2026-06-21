import type { OpportunityPoint, WorkflowGraph } from "./types";

/**
 * Pure-TS impact/effort matrix — NO LLM call. Each opportunity becomes a step
 * carrying `metric = { x: effort weeks, y: impact $ }`; the renderer scales the
 * axes. Confidence is 1 because the inputs are already-computed scores.
 */
export function buildImpactEffort(opps: OpportunityPoint[]): WorkflowGraph {
  return {
    kind: "impact_effort",
    title: "Impact vs. effort",
    lanes: [],
    steps: opps.map((o, i) => ({
      id: `opp-${i}`,
      label: o.title,
      laneId: null,
      stepKind: "step" as const,
      inferred: false,
      captureIds: [],
      metric: { x: o.timeToShipWeeksHigh, y: o.impactHigh },
    })),
    edges: [],
    confidence: {
      score: 1,
      coverage: 1,
      corroboratedCount: opps.length,
      disputedStepIds: [],
    },
    modelVersion: "pure-ts",
  };
}
