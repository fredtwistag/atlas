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
const MAX_ATTEMPTS = 3; // generation is non-deterministic; a rich-evidence opp can
// return a dud once. Retry recovers that variance — a genuinely ungroundable opp
// still abstains on every attempt, so the honesty gate is preserved.

/**
 * Build one current-state diagram for a single opportunity from its evidence.
 * Chooses the kind, then up to MAX_ATTEMPTS times generates with the opportunity
 * as context, validates, and confidence-gates (coverage scoped to the kind's
 * relevant captures); returns the first graph that clears the gate, or null
 * (abstain) if none do. No critic pass — the input is the opportunity's
 * already-scored evidence; validate + the gate are enough.
 */
export async function generateOpportunityDiagram(
  opp: { title: string },
  captures: WorkflowCapture[],
  roleLabels: string[],
  modelVersion: string,
  attempts: number = MAX_ATTEMPTS,
): Promise<WorkflowGraph | null> {
  const kind = chooseOpportunityKind(captures);
  const known = new Set(captures.map((c) => c.id));
  const relevant = captures.filter((c) => relevantKindsFor(kind).has(c.kind));
  const scoreCaptures = relevant.length > 0 ? relevant : captures;

  for (let attempt = 0; attempt < attempts; attempt++) {
    // Attach the rejection handler synchronously to avoid vitest's unhandled-rejection listener
    // (jsdom environment in vitest 4 fires the handler if a tick passes before .catch is registered).
    const draft = await generateGraph(kind, captures, roleLabels, { opportunityTitle: opp.title }).catch(
      () => null,
    );
    if (!draft) continue;

    const cleaned = validateGraph(draft, known);
    if (cleaned.steps.length < MIN_STEPS) continue;

    const scored = scoreConfidence(cleaned, scoreCaptures);
    if (scored.score < MIN_CONFIDENCE) continue;

    return { ...cleaned, confidence: { ...scored, disputedStepIds: [] }, modelVersion };
  }
  return null;
}
