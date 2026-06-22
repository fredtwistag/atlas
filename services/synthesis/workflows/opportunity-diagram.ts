import { generateGraph, relevantKindsFor } from "./generate";
import { validateGraph } from "./validate";
import { scoreConfidence } from "./confidence";
import type { WorkflowCapture, WorkflowGraph } from "./types";

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

const MIN_STEPS = 2;
const MIN_CONFIDENCE = 0.3; // same bar as sprint-level; coverage is scoped to the opp's relevant captures

/**
 * Build one current-state diagram for a single opportunity from its evidence.
 * Chooses the kind, generates with the opportunity as context, validates,
 * confidence-gates (coverage scoped to the kind's relevant captures), and
 * returns the graph or null (abstain). No critic pass — the input is the
 * opportunity's already-scored evidence; validate + the gate are enough.
 */
export async function generateOpportunityDiagram(
  opp: { title: string },
  captures: WorkflowCapture[],
  roleLabels: string[],
  modelVersion: string,
): Promise<WorkflowGraph | null> {
  const kind = chooseOpportunityKind(captures);
  // Attach the rejection handler synchronously to avoid vitest's unhandled-rejection listener
  // (jsdom environment in vitest 4 fires the handler if a tick passes before .catch is registered).
  const draft = await generateGraph(kind, captures, roleLabels, { opportunityTitle: opp.title }).catch(
    () => null,
  );
  if (!draft) return null;

  const known = new Set(captures.map((c) => c.id));
  const cleaned = validateGraph(draft, known);
  if (cleaned.steps.length < MIN_STEPS) return null;

  const relevant = captures.filter((c) => relevantKindsFor(kind).has(c.kind));
  const scored = scoreConfidence(cleaned, relevant.length > 0 ? relevant : captures);
  if (scored.score < MIN_CONFIDENCE) return null;

  return { ...cleaned, confidence: { ...scored, disputedStepIds: [] }, modelVersion };
}
