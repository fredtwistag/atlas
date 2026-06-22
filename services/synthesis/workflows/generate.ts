import { completeStructured } from "@/services/llm/client";
import {
  workflowGraphDraft,
  workflowCritique,
  type WorkflowGraphDraft,
  type WorkflowCritique,
  type WorkflowKind,
} from "@/services/llm/schemas";
import type { WorkflowCapture } from "./types";

interface KindPromptConfig {
  relevantKinds: Set<string>;
  system: (roleLabels: string[]) => string;
}

function rulesBlock(roleLabels: string[]): string {
  return [
    "RULES:",
    "1. Use ONLY these captureIds — never invent one:",
    "   they are the uuids prefixed on each capture line below.",
    "2. Every step and edge MUST cite the captureIds it is based on. If you add a",
    "   connecting step that no capture directly supports, set inferred=true and",
    "   leave captureIds empty — never present a guess as observed fact.",
    "3. Lanes represent roles. Use ONLY these role labels for lanes:",
    `   ${roleLabels.join(", ") || "(none provided)"}.`,
    "4. Plain words only. No marketing language. No names of people.",
    "5. step/lane/edge `id` values are short slugs you choose (e.g. 's1',",
    "   'lane-ops'); `from`/`to` reference step ids; captureIds are the uuids.",
  ].join("\n");
}

const swimlaneSystem = (roleLabels: string[]): string =>
  [
    "You map how operational work actually flows, as a cross-functional",
    "swimlane. Lanes are roles; a step sits in the lane of whoever does it; an",
    "edge from a step in one lane to a step in another lane is a handoff",
    "(edgeKind='handoff'). Same-lane progression is edgeKind='flow'. Mark a",
    "step that is a known pain point with stepKind='bottleneck' and cite the",
    "bottleneck/workaround capture as its evidence.",
    "",
    rulesBlock(roleLabels),
    "",
    "Return JSON matching: { kind:'swimlane', title, lanes:[{id,roleLabel,",
    "department}], steps:[{id,label,laneId,stepKind,inferred,captureIds}],",
    "edges:[{id,from,to,edgeKind,label,inferred,captureIds}] }.",
  ].join("\n");

const topologySystem = (roleLabels: string[]): string =>
  [
    "You map the current-state SYSTEMS topology: tools as nodes, the data",
    "flow between them as edges. stepKind='system' for sanctioned tools,",
    "'shadow_tool' for unofficial spreadsheets/apps, 'gap' is not used for",
    "nodes. An edge where data is manually re-keyed between tools is",
    "edgeKind='gap'; an automated/clean connection is edgeKind='flow'. Lanes",
    "are not used here — leave lanes empty and laneId null.",
    "",
    rulesBlock(roleLabels),
    "",
    "Return JSON matching: { kind:'systems_topology', title, lanes:[], steps:[",
    "{id,label,laneId,stepKind,inferred,captureIds}], edges:[{id,from,to,",
    "edgeKind,label,inferred,captureIds}] }.",
  ].join("\n");

export const KIND_PROMPTS: Partial<Record<WorkflowKind, KindPromptConfig>> = {
  swimlane: {
    relevantKinds: new Set(["handoff", "sop", "decision", "bottleneck", "workaround"]),
    system: swimlaneSystem,
  },
  systems_topology: {
    relevantKinds: new Set(["tooling", "workaround"]),
    system: topologySystem,
  },
};

/**
 * The capture kinds a given diagram kind draws from. Used to scope the
 * confidence coverage to the captures the map could actually have used (so a
 * tight, accurate topology that only touches tooling/workaround isn't penalised
 * against the whole sprint's captures).
 */
export function relevantKindsFor(kind: WorkflowKind): Set<string> {
  return KIND_PROMPTS[kind]?.relevantKinds ?? new Set<string>();
}

/** Capture lines sent to the model — id, kind, role, summary. NEVER contributorId/name. */
function captureLines(captures: WorkflowCapture[]): string {
  return captures
    .map((c) => `- ${c.id} [${c.kind}] (${c.role}) ${c.summary}`)
    .join("\n");
}

/**
 * Generate one diagram graph for `kind`. Returns null when there are no
 * relevant captures (nothing to draw). Forces the output `kind` to the
 * requested kind so the model can't drift the type.
 */
export async function generateGraph(
  kind: WorkflowKind,
  captures: WorkflowCapture[],
  roleLabels: string[],
  context?: { opportunityTitle: string },
): Promise<WorkflowGraphDraft | null> {
  const config = KIND_PROMPTS[kind];
  if (!config) throw new Error(`No prompt config for workflow kind: ${kind}`);

  const relevant = captures.filter((c) => config.relevantKinds.has(c.kind));
  if (relevant.length === 0) return null;

  const userLines = ["Build the workflow graph from these captures.", ""];
  if (context) {
    userLines.push(
      `CONTEXT: this is the current-state workflow behind a specific improvement — "${context.opportunityTitle}". Draw only the slice relevant to it, and mark the single step or seam it removes as a bottleneck (stepKind 'bottleneck') or gap (edgeKind 'gap').`,
      "",
    );
  }
  userLines.push("CAPTURES (id [kind] (role) summary):", captureLines(relevant));

  const draft = await completeStructured({
    system: config.system(roleLabels),
    schema: workflowGraphDraft,
    // A rich swimlane over many captures can exceed a small budget and truncate
    // the JSON mid-string; give it room.
    maxTokens: 8192,
    messages: [{ role: "user", content: userLines.join("\n") }],
  });

  return { ...draft, kind };
}

function critiqueSystem(): string {
  return [
    "You are an adversarial reviewer of a synthesized workflow graph. For each",
    "step and edge you are given the exact capture evidence it cites. Flag any",
    "step or edge that OVERSTATES what its evidence supports, or whose evidence",
    "is '(none)' while it is presented as observed. Be strict: when in doubt,",
    "flag it. Do not flag steps/edges that are well supported.",
    "",
    "Return JSON: { unsupportedStepIds: [...], unsupportedEdgeIds: [...] }.",
  ].join("\n");
}

/**
 * Independent critic pass. Returns the ids the model judges unsupported; the
 * orchestrator drops them. Best-effort — callers handle a thrown LLM error.
 */
export async function critiqueGraph(
  graph: WorkflowGraphDraft,
  captures: WorkflowCapture[],
): Promise<WorkflowCritique> {
  const summaryById = new Map(captures.map((c) => [c.id, c.summary]));
  const ev = (ids: string[]): string =>
    ids
      .map((id) => summaryById.get(id))
      .filter((s): s is string => Boolean(s))
      .join(" | ") || "(none)";

  const stepLines = graph.steps
    .map((s) => `STEP ${s.id}: "${s.label}" — evidence: ${ev(s.captureIds)}`)
    .join("\n");
  const edgeLines = graph.edges
    .map((e) => `EDGE ${e.id}: ${e.from}->${e.to} (${e.edgeKind}) — evidence: ${ev(e.captureIds)}`)
    .join("\n");

  return completeStructured({
    system: critiqueSystem(),
    schema: workflowCritique,
    maxTokens: 1024,
    messages: [
      {
        role: "user",
        content: ["Review this graph against its evidence.", "", stepLines, "", edgeLines].join("\n"),
      },
    ],
  });
}
