import { completeStructured } from "@/services/llm/client";
import { stakeholderMap, type Stakeholder } from "@/services/llm/schemas";

/**
 * Stakeholder map (Ticket B). From decision + handoff captures and the roster
 * roles, derive role-level stakeholders — decision_maker / blocker / adopter —
 * and the opportunities each gates. An opportunity you can't get approved is
 * worthless; this is the "defend it in the CFO's office" intelligence.
 *
 * Privacy (CLAUDE.md): ROLE LABELS ONLY. The input carries role/department +
 * capture summaries (never names), and every returned gatedOpportunityId is
 * validated back to a real sprint opportunity id.
 */

export type StakeholderCapture = {
  kind: string;
  summary: string;
  role: string;
};

export type StakeholderOpportunity = {
  id: string;
  title: string;
};

const RELEVANT_KINDS = new Set(["decision", "handoff"]);

function stakeholderPrompt(): string {
  return [
    "You map the stakeholders around a set of operational opportunities, using",
    "decision-gate and handoff captures plus the contributor roster.",
    "",
    "For each distinct role that matters to getting this work approved or",
    "adopted, emit a stakeholder:",
    "- decision_maker: gates approval/funding (sign-off, budget).",
    "- blocker: can stall or resist (owns a competing process, must change how",
    "  they work).",
    "- adopter: the role that has to actually use the change day to day.",
    "",
    "RULES:",
    "1. Refer to people ONLY by role/title (e.g. 'VP Sales', 'Billing lead').",
    "   NEVER use or invent an individual's name.",
    "2. gatedOpportunityIds MUST be drawn from the opportunity ids given below;",
    "   never invent an id. Use [] if a stakeholder gates none specifically.",
    "3. Prefer a few well-evidenced stakeholders over many speculative ones.",
    "",
    "Return JSON: { stakeholders: [{ roleLabel, department, type, summary, gatedOpportunityIds }] }.",
  ].join("\n");
}

/**
 * Derive the stakeholder map. Filters to decision/handoff captures; if there
 * are none, short-circuits to [] (no model call). Validates every
 * gatedOpportunityId back to a real opportunity id.
 */
export async function mapStakeholders(opts: {
  captures: StakeholderCapture[];
  opportunities: StakeholderOpportunity[];
  roles: string[];
}): Promise<Stakeholder[]> {
  const relevant = opts.captures.filter((c) => RELEVANT_KINDS.has(c.kind));
  if (relevant.length === 0) return [];

  const knownOpp = new Set(opts.opportunities.map((o) => o.id));
  const captureLines = relevant
    .map((c) => `- [${c.kind}] (${c.role}) ${c.summary}`)
    .join("\n");
  const oppLines = opts.opportunities
    .map((o) => `- ${o.id} ${o.title}`)
    .join("\n");
  const roleLines = [...new Set(opts.roles)].join(", ");

  const { stakeholders } = await completeStructured({
    system: stakeholderPrompt(),
    schema: stakeholderMap,
    maxTokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          "ROSTER ROLES: " + (roleLines || "(unknown)"),
          "",
          "DECISION / HANDOFF CAPTURES (role-attributed, no names):",
          captureLines,
          "",
          "OPPORTUNITIES (id title):",
          oppLines || "(none yet)",
        ].join("\n"),
      },
    ],
  });

  return stakeholders.map((s) => ({
    ...s,
    gatedOpportunityIds: s.gatedOpportunityIds.filter((id) => knownOpp.has(id)),
  }));
}
