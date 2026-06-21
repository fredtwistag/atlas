import type { WorkflowCritique, WorkflowGraphDraft } from "@/services/llm/schemas";
import { captureStats, routeKinds } from "./stats";
import { validateGraph } from "./validate";
import { scoreConfidence } from "./confidence";
import { buildImpactEffort } from "./impact-effort";
import { generateGraph, critiqueGraph } from "./generate";
import type { OpportunityPoint, WorkflowCapture, WorkflowGraph } from "./types";

const MIN_STEPS = 2;
const MIN_CONFIDENCE = 0.3; // conservative; tune against real sprints (spec §15)

export interface SynthesizeInput {
  captures: WorkflowCapture[];
  opportunities: OpportunityPoint[];
  roleLabels: string[];
  modelVersion: string;
}

/** Drop critic-flagged steps/edges, then re-validate to re-prune dangling refs. */
function applyCritique(
  graph: WorkflowGraphDraft,
  critique: WorkflowCritique,
  knownCaptureIds: Set<string>,
): WorkflowGraphDraft {
  const badSteps = new Set(critique.unsupportedStepIds);
  const badEdges = new Set(critique.unsupportedEdgeIds);
  const pruned: WorkflowGraphDraft = {
    ...graph,
    steps: graph.steps.filter((s) => !badSteps.has(s.id)),
    edges: graph.edges.filter((e) => !badEdges.has(e.id)),
  };
  return validateGraph(pruned, knownCaptureIds);
}

/**
 * The engine, end to end: route → generate → validate → critic → confidence →
 * gate. Returns only the graphs that PASS the gate (all status 'provisional');
 * below-threshold or under-supported diagrams are abstained (omitted). Never
 * throws for a single failing kind — that kind is skipped.
 */
export async function synthesizeWorkflows(
  input: SynthesizeInput,
): Promise<WorkflowGraph[]> {
  const { captures, opportunities, roleLabels, modelVersion } = input;
  const stats = captureStats(captures);
  const kinds = routeKinds(stats, opportunities.length);
  const known = new Set(captures.map((c) => c.id));
  const out: WorkflowGraph[] = [];

  if (kinds.includes("impact_effort")) {
    out.push(buildImpactEffort(opportunities));
  }

  for (const kind of kinds) {
    if (kind === "impact_effort") continue;

    let draft: WorkflowGraphDraft | null;
    try {
      draft = await generateGraph(kind, captures, roleLabels);
    } catch {
      continue; // best-effort: a failing kind never sinks the batch
    }
    if (!draft) continue;

    let cleaned = validateGraph(draft, known);

    let critique: WorkflowCritique = { unsupportedStepIds: [], unsupportedEdgeIds: [] };
    try {
      critique = await critiqueGraph(cleaned, captures);
    } catch {
      // best-effort: keep the validated graph if the critic is unavailable
    }
    cleaned = applyCritique(cleaned, critique, known);

    if (cleaned.steps.length < MIN_STEPS) continue; // abstain
    const scored = scoreConfidence(cleaned, captures);
    if (scored.score < MIN_CONFIDENCE) continue; // held

    out.push({
      ...cleaned,
      confidence: { ...scored, disputedStepIds: [] },
      modelVersion,
    });
  }

  return out;
}
