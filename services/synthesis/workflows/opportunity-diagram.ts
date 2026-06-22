import type { WorkflowCapture } from "./types";

/**
 * Pick the diagram kind that fits an opportunity's evidence: systems topology
 * when tooling/integration captures dominate, otherwise a process swimlane.
 * Ties and empty input default to swimlane.
 */
export function chooseOpportunityKind(
  captures: WorkflowCapture[],
): "swimlane" | "systems_topology" {
  let systemish = 0;
  let processish = 0;
  for (const c of captures) {
    if (c.kind === "tooling" || c.kind === "workaround") systemish++;
    if (c.kind === "handoff" || c.kind === "sop" || c.kind === "decision" || c.kind === "bottleneck") processish++;
  }
  return systemish > processish ? "systems_topology" : "swimlane";
}
