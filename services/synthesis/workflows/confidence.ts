import type { WorkflowGraphDraft } from "@/services/llm/schemas";
import type { WorkflowCapture } from "./types";

/**
 * Confidence derived from grounding facts — never the model's self-report.
 *   coverage          = distinct captures used / total captures
 *   corroboratedCount = elements (steps+edges) backed by ≥2 distinct contributors
 *   score             = 0.5·coverage + 0.5·(corroborated / elements)
 * `disputedStepIds` is filled by the orchestrator from the critic; this pure
 * function does not detect semantic conflict.
 */
export function scoreConfidence(
  graph: WorkflowGraphDraft,
  captures: WorkflowCapture[],
): { score: number; coverage: number; corroboratedCount: number } {
  const contributorByCapture = new Map(
    captures.map((c) => [c.id, c.contributorId]),
  );
  const elements = [...graph.steps, ...graph.edges];
  const used = new Set<string>();
  let corroborated = 0;

  for (const el of elements) {
    const contributors = new Set<string>();
    for (const cid of el.captureIds) {
      used.add(cid);
      const who = contributorByCapture.get(cid);
      if (who) contributors.add(who);
    }
    if (contributors.size >= 2) corroborated++;
  }

  const coverage =
    captures.length === 0 ? 0 : Math.min(1, used.size / captures.length);
  const corroborationRatio =
    elements.length === 0 ? 0 : corroborated / elements.length;
  const score = Math.min(1, 0.5 * coverage + 0.5 * corroborationRatio);

  return { score, coverage, corroboratedCount: corroborated };
}
