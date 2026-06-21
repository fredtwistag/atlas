import type { WorkflowGraphDraft } from "@/services/llm/schemas";

/**
 * Deterministic grounding guard. Drops any step/edge that is not backed by a
 * real capture (unless explicitly `inferred`), filters fabricated captureIds,
 * nulls dangling laneIds, removes edges whose endpoints didn't survive, and
 * prunes unreferenced lanes. This is the layer that kills a hallucinated step
 * carrying a made-up citation.
 */
export function validateGraph(
  graph: WorkflowGraphDraft,
  knownCaptureIds: Set<string>,
): WorkflowGraphDraft {
  const laneIds = new Set(graph.lanes.map((l) => l.id));

  const steps = graph.steps
    .map((s) => ({
      ...s,
      captureIds: s.captureIds.filter((id) => knownCaptureIds.has(id)),
    }))
    .filter((s) => s.captureIds.length > 0 || s.inferred)
    .map((s) => ({
      ...s,
      laneId: s.laneId && laneIds.has(s.laneId) ? s.laneId : null,
    }));

  const stepIds = new Set(steps.map((s) => s.id));

  const edges = graph.edges
    .filter((e) => stepIds.has(e.from) && stepIds.has(e.to))
    .map((e) => ({
      ...e,
      captureIds: e.captureIds.filter((id) => knownCaptureIds.has(id)),
    }))
    .filter((e) => e.captureIds.length > 0 || e.inferred);

  const usedLaneIds = new Set(
    steps.map((s) => s.laneId).filter((id): id is string => id !== null),
  );
  const lanes = graph.lanes.filter((l) => usedLaneIds.has(l.id));

  return { ...graph, lanes, steps, edges };
}
