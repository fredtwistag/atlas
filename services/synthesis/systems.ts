import { completeStructured } from "@/services/llm/client";
import {
  systemsInventory,
  type SystemInventoryItem,
} from "@/services/llm/schemas";

/**
 * Current-state systems & shadow-IT inventory (Ticket F). Clusters the sprint's
 * `tooling` + `workaround` captures into named systems, each categorized:
 * - system: an official, sanctioned tool.
 * - shadow_tool: an unofficial spreadsheet/DM/app people actually rely on.
 * - integration_gap: a missing seam between systems (manual re-keying, exports).
 *
 * One LLM call (no embeddings), mirroring services/opportunity/cluster.ts. Every
 * returned captureId is validated back to a real input id. No names.
 */

export type SystemCapture = {
  id: string;
  kind: string;
  summary: string;
};

const RELEVANT_KINDS = new Set(["tooling", "workaround"]);

function systemPrompt(): string {
  return [
    "You build a current-state systems inventory from operational discovery",
    "captures about tools and workarounds. Group captures that refer to the SAME",
    "system or tool into one item, and categorize each item:",
    "- system: an official, sanctioned tool of record.",
    "- shadow_tool: an unofficial spreadsheet, doc, DM thread, or app the team",
    "  relies on that isn't sanctioned.",
    "- integration_gap: a missing connection between systems (manual re-keying,",
    "  CSV exports, copy-paste between tools).",
    "",
    "RULES:",
    "1. Every captureId you return MUST be one of the ids given below. Never",
    "   invent an id, and use each captureId at most once.",
    "2. `name` is the tool/system/gap in plain words (e.g. 'Pricing spreadsheet',",
    "   'Salesforce → ERP gap'). No marketing language.",
    "3. It's fine to leave unrelated captures out.",
    "",
    "Return JSON: { items: [{ name, category, summary, captureIds }] }.",
  ].join("\n");
}

/**
 * Cluster tooling/workaround captures into a categorized systems inventory.
 * Filters to the relevant kinds first; short-circuits to [] when there's
 * nothing to cluster. Drops any item whose captureIds don't resolve to real,
 * unused input ids.
 */
export async function clusterSystems(
  captures: SystemCapture[],
): Promise<SystemInventoryItem[]> {
  const relevant = captures.filter((c) => RELEVANT_KINDS.has(c.kind));
  if (relevant.length === 0) return [];

  const known = new Set(relevant.map((c) => c.id));
  const lines = relevant
    .map((c) => `- ${c.id} [${c.kind}] ${c.summary}`)
    .join("\n");

  const { items } = await completeStructured({
    system: systemPrompt(),
    schema: systemsInventory,
    maxTokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          "Build the systems inventory from these captures.",
          "",
          "CAPTURES (id [kind] summary):",
          lines,
        ].join("\n"),
      },
    ],
  });

  const used = new Set<string>();
  const cleaned: SystemInventoryItem[] = [];
  for (const item of items) {
    const ids = item.captureIds.filter((id) => known.has(id) && !used.has(id));
    if (ids.length === 0) continue;
    for (const id of ids) used.add(id);
    cleaned.push({ ...item, captureIds: ids });
  }
  return cleaned;
}
