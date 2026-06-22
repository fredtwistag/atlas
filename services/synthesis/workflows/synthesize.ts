import { captureStats, routeKinds } from "./stats";
import { buildImpactEffort } from "./impact-effort";
import type { OpportunityPoint, WorkflowCapture, WorkflowGraph } from "./types";

export interface SynthesizeInput {
  captures: WorkflowCapture[];
  opportunities: OpportunityPoint[];
  roleLabels: string[];
  modelVersion: string;
}

/**
 * Sprint-level synthesis. Process/systems diagrams now live per-opportunity
 * (see opportunity-diagram.ts); at sprint level we emit only the pure-TS
 * impact/effort matrix.
 */
export async function synthesizeWorkflows(
  input: SynthesizeInput,
): Promise<WorkflowGraph[]> {
  const stats = captureStats(input.captures);
  const kinds = routeKinds(stats, input.opportunities.length);
  const out: WorkflowGraph[] = [];
  if (kinds.includes("impact_effort")) {
    out.push(buildImpactEffort(input.opportunities));
  }
  return out;
}
