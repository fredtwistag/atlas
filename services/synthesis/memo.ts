import { completeStructured } from "@/services/llm/client";
import { synthesisMemo, type SynthesisMemo } from "@/services/llm/schemas";
import type { Horizon } from "@/lib/types";

/**
 * Synthesis memo (Ticket G): the board-ready narrative a sponsor forwards. It
 * connects the portfolio → who approves/adopts it → where it'll meet
 * resistance → a sequenced next step. Generated once at sprint close (cached on
 * the sprint), so it adds no per-render LLM cost.
 *
 * Inputs are already role-level and name-free (portfolio titles, stakeholder
 * role labels, adoption bands). This is the only LLM call here, and it only
 * writes prose.
 */

export type MemoInput = {
  tenantName: string;
  portfolio: { title: string; horizon: Horizon; inclusionRationale: string }[];
  stakeholders: { roleLabel: string; type: string }[];
  adoptionRisk: { department: string; level: string }[];
  recommendedNextStep?: string;
};

const FALLBACK: SynthesisMemo = {
  openingNarrative: "",
  portfolioStory: "",
  sequencingLogic: "",
  riskNarrative: "",
  recommendedNextStep: "",
};

/**
 * Generate the synthesis memo. Returns empty strings (never throws) when there
 * is nothing to synthesize (no portfolio) or the model call fails — the report
 * renders only the sections that have content.
 */
export async function generateSynthesisMemo(
  opts: MemoInput,
): Promise<SynthesisMemo> {
  if (opts.portfolio.length === 0) return FALLBACK;

  const portfolioLines = opts.portfolio
    .map((p) => `- ${p.title} [${p.horizon}] — ${p.inclusionRationale}`)
    .join("\n");
  const stakeholderLines =
    opts.stakeholders.map((s) => `- ${s.roleLabel} (${s.type})`).join("\n") ||
    "(none mapped)";
  const riskLines =
    opts.adoptionRisk
      .map((r) => `- ${r.department}: ${r.level} resistance`)
      .join("\n") || "(none)";

  try {
    return await completeStructured({
      system: [
        "You write a board-ready synthesis memo for a discovery sprint a sponsor",
        "will forward to their board. Honest, specific, no marketing-speak (no",
        "'leverage', 'unlock', 'seamless', 'robust', 'game-changer', 'empower').",
        "No individual names — refer to people by role only.",
        "",
        "Produce these fields:",
        "- openingNarrative: what the sprint found, in 2-3 sentences.",
        "- portfolioStory: why this specific portfolio of pilots.",
        "- sequencingLogic: the order to run them and why (quick wins prove value",
        "  while the strategic bet pays off).",
        "- riskNarrative: where adoption will meet resistance and how the",
        "  sequencing de-risks it.",
        "- recommendedNextStep: the single concrete next step.",
      ].join("\n"),
      schema: synthesisMemo,
      maxTokens: 1400,
      messages: [
        {
          role: "user",
          content: [
            `ORGANIZATION: ${opts.tenantName}`,
            "",
            "PILOT PORTFOLIO:",
            portfolioLines,
            "",
            "STAKEHOLDERS (role only):",
            stakeholderLines,
            "",
            "ADOPTION RISK BY DEPARTMENT:",
            riskLines,
          ].join("\n"),
        },
      ],
    });
  } catch {
    return FALLBACK;
  }
}
