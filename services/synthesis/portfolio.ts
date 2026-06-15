import { completeStructured } from "@/services/llm/client";
import { portfolioNarrative } from "@/services/llm/schemas";
import type { Horizon } from "@/lib/types";

/**
 * Pilot Portfolio Designer (Ticket A). The "restaurant" artifact: a curated,
 * balanced 3-5 opportunity recommendation — not a ranked leaderboard.
 *
 * SELECTION is deterministic TS (this file, unit-tested). The NARRATIVE is the
 * only LLM call, and it only writes prose — it never picks the set. Honest
 * calibration (CLAUDE.md): if fewer than MIN_PORTFOLIO high-confidence
 * opportunities exist, we return what we have and say so — we never pad.
 */

const MIN_CONFIDENCE = 3;
const MIN_PORTFOLIO = 3;
const MAX_PORTFOLIO = 5;

export type PortfolioCandidate = {
  /** Persisted opportunity id. */
  id: string;
  title: string;
  horizon: Horizon;
  departments: string[];
  compositeScore: number;
  confidenceScore: number;
};

export type PortfolioItem = {
  opportunityId: string;
  sequenceOrder: number;
  inclusionRationale: string;
};

export type PortfolioSelection = {
  items: PortfolioItem[];
  /** True when fewer than MIN_PORTFOLIO high-confidence candidates existed. */
  underfilled: boolean;
};

function inclusionRationale(
  c: PortfolioCandidate,
  newDepartment: boolean,
): string {
  if (c.horizon === "quick_win") {
    return "Quick win — fast, standalone proof point to build momentum.";
  }
  if (c.horizon === "strategic_bet") {
    return "Strategic bet — the high-impact play this portfolio is built around.";
  }
  if (newDepartment && c.departments.length > 0) {
    return `Broadens coverage into ${c.departments[0]}.`;
  }
  return "Strong, well-evidenced opportunity that rounds out the set.";
}

/**
 * Select a balanced 3-5 portfolio (pure). Honors, in priority order: at least
 * one quick win + one strategic bet when available, department spread, then raw
 * composite. Only high-confidence (>= 3) candidates are eligible; if fewer than
 * 3 are, returns them all and flags `underfilled`.
 */
export function selectPortfolio(
  candidates: PortfolioCandidate[],
): PortfolioSelection {
  const eligible = candidates
    .filter((c) => c.confidenceScore >= MIN_CONFIDENCE)
    .sort((a, b) => b.compositeScore - a.compositeScore);

  if (eligible.length < MIN_PORTFOLIO) {
    return {
      items: eligible.map((c, i) => ({
        opportunityId: c.id,
        sequenceOrder: i + 1,
        inclusionRationale: inclusionRationale(c, false),
      })),
      underfilled: true,
    };
  }

  const picked: PortfolioCandidate[] = [];
  const pickedIds = new Set<string>();
  const take = (c: PortfolioCandidate | undefined) => {
    if (c && !pickedIds.has(c.id) && picked.length < MAX_PORTFOLIO) {
      picked.push(c);
      pickedIds.add(c.id);
    }
  };

  // 1. Anchor: the single highest-composite opportunity.
  take(eligible[0]);
  // 2. Guarantee a strategic bet and a quick win if they exist.
  take(eligible.find((c) => c.horizon === "strategic_bet"));
  take(eligible.find((c) => c.horizon === "quick_win"));

  // 3. Fill remaining slots, preferring departments not yet represented.
  const repDepts = new Set(picked.flatMap((c) => c.departments));
  const rest = eligible.filter((c) => !pickedIds.has(c.id));
  const fresh = rest.filter((c) => c.departments.some((d) => !repDepts.has(d)));
  const others = rest.filter(
    (c) => !c.departments.some((d) => !repDepts.has(d)),
  );
  for (const c of [...fresh, ...others]) {
    if (picked.length >= MAX_PORTFOLIO) break;
    take(c);
  }

  // Ensure the minimum (only reachable if eligible >= MIN_PORTFOLIO, which holds).
  // Order the final set by composite for a clean reading sequence.
  const ordered = [...picked].sort(
    (a, b) => b.compositeScore - a.compositeScore,
  );
  const finalRepDepts = new Set<string>();
  const items = ordered.map((c, i) => {
    const newDept = c.departments.some((d) => !finalRepDepts.has(d));
    c.departments.forEach((d) => finalRepDepts.add(d));
    return {
      opportunityId: c.id,
      sequenceOrder: i + 1,
      inclusionRationale: inclusionRationale(c, newDept),
    };
  });

  return { items, underfilled: false };
}

export type NarrativeOpts = {
  tenantName: string;
  underfilled: boolean;
  items: {
    title: string;
    horizon: Horizon;
    impactLow: number;
    impactHigh: number;
  }[];
};

/**
 * Write the portfolio narrative (the only LLM call here). Honest tone, no
 * marketing-speak, no names. When `underfilled`, the model is told to say the
 * evidence only supports a smaller set rather than overclaim.
 */
export async function writePortfolioNarrative(
  opts: NarrativeOpts,
): Promise<string> {
  if (opts.items.length === 0) return "";
  const lines = opts.items
    .map(
      (it) =>
        `- ${it.title} (${it.horizon}, $${it.impactLow.toLocaleString("en-US")}–$${it.impactHigh.toLocaleString("en-US")}/yr)`,
    )
    .join("\n");

  const { narrative } = await completeStructured({
    system: [
      "You write the framing paragraph for a pilot portfolio a sponsor will take",
      "to their board. Honest, specific, no marketing-speak (no 'leverage',",
      "'unlock', 'seamless', 'robust', 'game-changer'). No individual names.",
      "Explain why THESE opportunities, why now, and how they sequence into an",
      "operating-model move (quick wins prove value while the strategic bet pays",
      "off). 120-180 words. One paragraph.",
      opts.underfilled
        ? "IMPORTANT: the evidence only supports a small set so far — say that plainly and recommend more discovery rather than overclaiming."
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    schema: portfolioNarrative,
    maxTokens: 600,
    messages: [
      {
        role: "user",
        content: `ORGANIZATION: ${opts.tenantName}\n\nSELECTED PORTFOLIO:\n${lines}`,
      },
    ],
  });
  return narrative;
}
