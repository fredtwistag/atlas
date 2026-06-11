import { completeStructured } from "@/services/llm/client";
import { clusterResult, type CaptureCluster } from "@/services/llm/schemas";

/**
 * Plan 016 Step 2 — clustering.
 *
 * Group a sprint's non-removed captures into candidate themes. The operator
 * decision for launch week is NO embeddings vendor (Anthropic has no embeddings
 * API and we add no second LLM vendor this week), so this takes the plan's
 * documented no-embeddings path: one `completeStructured` call over all capture
 * summaries. At pilot scale (≤150 captures/sprint) the whole set fits in
 * context comfortably.
 *
 * Privacy (CLAUDE.md): the model sees capture id + kind + summary ONLY. No user
 * names, no quotes, no roles at this stage — clustering doesn't need them and
 * the less PII crosses the boundary the better.
 */

/** The clustering input for a single capture — id/kind/summary, nothing else. */
export type ClusterCapture = {
  id: string;
  kind: string;
  summary: string;
};

function clusterSystem(): string {
  return [
    "You group operational discovery captures into candidate opportunity",
    "themes. Each capture is one concrete fact a contributor stated (a",
    "bottleneck, workaround, tool, handoff, frustration, SOP, or decision gate).",
    "",
    "Your job: cluster captures that point at the SAME underlying operational",
    "problem or improvement. A good theme is specific enough that a single",
    "solution could address all its captures.",
    "",
    "RULES:",
    "1. A theme MUST group at least 2 distinct captures. Never emit a",
    "   single-capture theme — drop lone captures entirely.",
    "2. Every captureId you return MUST be one of the ids given below. Never",
    "   invent an id.",
    "3. A capture may belong to at most one theme. Do not reuse a captureId",
    "   across themes.",
    "4. Prefer a few strong themes over many weak ones. It is fine to leave",
    "   weakly-related captures unclustered.",
    "5. `theme` is a short, plain-language label (no marketing language).",
    "",
    "Return JSON: { clusters: [{ theme, captureIds }] }.",
  ].join("\n");
}

/**
 * Cluster captures via the no-embeddings LLM path. Returns themes of ≥2
 * captures. Guards the model output: every returned captureId must be a real
 * input id, each capture is used at most once, and singleton themes are
 * dropped. An empty input (or fewer than 2 captures) short-circuits to [] with
 * no model call.
 */
export async function clusterCaptures(
  captures: ClusterCapture[],
): Promise<CaptureCluster[]> {
  if (captures.length < 2) return [];

  const known = new Set(captures.map((c) => c.id));
  const lines = captures
    .map((c) => `- ${c.id} [${c.kind}] ${c.summary}`)
    .join("\n");

  const { clusters } = await completeStructured({
    system: clusterSystem(),
    schema: clusterResult,
    maxTokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          "Cluster these captures into candidate themes.",
          "",
          "CAPTURES (id [kind] summary):",
          lines,
        ].join("\n"),
      },
    ],
  });

  // Defensive post-validation the Zod schema can't express: ids must be real
  // and used once. Trust nothing the model returns about identity.
  const used = new Set<string>();
  const cleaned: CaptureCluster[] = [];
  for (const cluster of clusters) {
    const ids = cluster.captureIds.filter(
      (id) => known.has(id) && !used.has(id),
    );
    if (ids.length < 2) continue;
    for (const id of ids) used.add(id);
    cleaned.push({ theme: cluster.theme, captureIds: ids });
  }
  return cleaned;
}
