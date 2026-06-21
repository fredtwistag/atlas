import type { WorkflowKind } from "@/services/llm/schemas";
import type { WorkflowCapture } from "./types";

export interface CaptureStats {
  total: number;
  byKind: Record<string, number>;
  distinctRoles: number;
  handoffCount: number;
  systemishCount: number;
  stepish: number;
}

export function captureStats(captures: WorkflowCapture[]): CaptureStats {
  const byKind: Record<string, number> = {};
  const roles = new Set<string>();
  for (const c of captures) {
    byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
    if (c.role) roles.add(c.role);
  }
  const k = (n: string) => byKind[n] ?? 0;
  return {
    total: captures.length,
    byKind,
    distinctRoles: roles.size,
    handoffCount: k("handoff"),
    systemishCount: k("tooling") + k("workaround"),
    stepish:
      k("sop") + k("decision") + k("handoff") + k("bottleneck") + k("workaround"),
  };
}

/**
 * Deterministic routing: which diagram kinds have enough signal to attempt.
 * Plan 1 produces swimlane, systems_topology, impact_effort only. Thresholds
 * are conservative and meant to be tuned against real sprint data (spec §15).
 */
export function routeKinds(
  stats: CaptureStats,
  opportunityCount: number,
): WorkflowKind[] {
  const kinds: WorkflowKind[] = [];
  if (stats.stepish >= 3 && stats.distinctRoles >= 2 && stats.handoffCount >= 1) {
    kinds.push("swimlane");
  }
  if (stats.systemishCount >= 2) {
    kinds.push("systems_topology");
  }
  if (opportunityCount >= 3) {
    kinds.push("impact_effort");
  }
  return kinds;
}
