import { readFileSync } from "node:fs";
import { join } from "node:path";
import { completeStructured } from "@/services/llm/client";
import {
  opportunityScoring,
  type OpportunityScoring,
  type DimensionKey,
  type QuantifiedImpact,
} from "@/services/llm/schemas";
import type { Horizon } from "@/lib/types";

/**
 * Plan 016 Step 3 — scoring.
 *
 * Turn one cluster of captures into a scored, rationale-backed opportunity. The
 * model emits the five rubric dimension scores (0-10) + reasoning; TypeScript
 * computes the weighted composite (the plan forbids letting the model do
 * arithmetic). The system prompt is the rubric file verbatim so scoring stays
 * in lockstep with prompts/scoring-rubric.md.
 *
 * Privacy (CLAUDE.md): the per-capture context passed to the model is
 * kind + summary + sourceQuote + role/department ONLY. User names never cross
 * this boundary, and the model is told to attribute by role, never by name.
 */

/** Rubric weights — must sum to 1.0. Mirrors prompts/scoring-rubric.md §Composite. */
export const DIMENSION_WEIGHTS: Record<DimensionKey, number> = {
  financial: 0.3,
  time_to_ship: 0.15,
  ai_suitability: 0.2,
  change_mgmt: 0.15,
  dependency: 0.2,
};

/** Human label per dimension key, for the stored DimensionScore[] (lib/types). */
export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  financial: "Financial impact",
  time_to_ship: "Time to ship",
  ai_suitability: "AI-suitability",
  change_mgmt: "Change management cost",
  dependency: "Dependency depth",
};

const RUBRIC = readFileSync(
  join(process.cwd(), "prompts", "scoring-rubric.md"),
  "utf8",
);

/** One capture as the scorer sees it — role/department, NEVER a name. */
export type ScoreCapture = {
  id: string;
  kind: string;
  summary: string;
  sourceQuote: string;
  /** Job title or role label. Falls back upstream to "Contributor". */
  role: string;
  department: string | null;
  /** Structured numbers the contributor stated (EXT-2), if any. */
  quantifiedImpact?: QuantifiedImpact | null;
};

/** Per-role loaded hourly rate (EUR), keyed by role label; `default` is the catch-all. */
export type CostBasis = Record<string, number>;

/**
 * Fallback loaded hourly rate (EUR) when a sprint has no cost basis and the
 * role isn't listed (EXT-2). A deliberately conservative mid-market blended
 * rate — the manager can override per role at sprint setup (EXT-2b).
 */
export const DEFAULT_LOADED_HOURLY_EUR = 75;

/** Resolve the loaded hourly rate for a role from the cost basis, else the default. */
export function rateForRole(
  role: string,
  costBasis: CostBasis | null | undefined,
): number {
  return (
    costBasis?.[role] ?? costBasis?.["default"] ?? DEFAULT_LOADED_HOURLY_EUR
  );
}

/**
 * Implied annual USD a capture represents, computed in TS (never the model):
 * a direct dollar cost × frequency if given, else time × frequency × hourly
 * rate. Returns null when there isn't enough to compute one.
 */
export function impliedAnnualUsd(
  q: QuantifiedImpact | null | undefined,
  hourlyRate: number,
): number | null {
  if (!q || q.frequencyPerYear == null) return null;
  if (q.unitCostUsd != null) {
    return Math.round(q.frequencyPerYear * q.unitCostUsd);
  }
  if (q.unitMinutes != null) {
    return Math.round(q.frequencyPerYear * (q.unitMinutes / 60) * hourlyRate);
  }
  return null;
}

/**
 * Funding horizon, derived in TS from the dimension scores + ship estimate
 * (Ticket D — the model never decides this). A barbell:
 * - quick_win: fast (≤4 wks, time_to_ship ≥7), standalone (dependency ≥7),
 *   low disruption (change_mgmt ≥6).
 * - strategic_bet: high financial (≥7) AND slow/disruptive/foundation-dependent
 *   (time_to_ship ≤5, or change_mgmt ≤4, or dependency ≤4).
 * - standard: everything else.
 */
export function computeHorizon(
  dimensionScores: { key: DimensionKey; score: number }[],
  timeToShipWeeksHigh: number,
): Horizon {
  const score = (k: DimensionKey) =>
    dimensionScores.find((d) => d.key === k)?.score ?? 0;
  const financial = score("financial");
  const timeToShip = score("time_to_ship");
  const changeMgmt = score("change_mgmt");
  const dependency = score("dependency");

  if (
    timeToShip >= 7 &&
    dependency >= 7 &&
    changeMgmt >= 6 &&
    timeToShipWeeksHigh <= 4
  ) {
    return "quick_win";
  }
  if (
    financial >= 7 &&
    (timeToShip <= 5 || changeMgmt <= 4 || dependency <= 4)
  ) {
    return "strategic_bet";
  }
  return "standard";
}

/**
 * Weighted composite from the model's dimension scores, rounded to one decimal.
 * Computed in TS — the model never does this arithmetic. Any dimension the
 * model somehow omitted contributes 0 (the Zod schema already guarantees all
 * five are present before we get here, so this is belt-and-suspenders).
 */
export function computeComposite(
  dimensionScores: { key: DimensionKey; score: number }[],
): number {
  let sum = 0;
  for (const { key, score } of dimensionScores) {
    sum += DIMENSION_WEIGHTS[key] * score;
  }
  return Math.round(sum * 10) / 10;
}

/** One line of company profile to ground baselines (CTX-4), or "" when unknown. */
function companyProfileLine(
  profile: ScoreClusterOpts["companyProfile"],
): string {
  if (!profile) return "";
  const bits = [profile.industry, profile.sizeBand].filter(Boolean);
  return bits.length ? `BUSINESS PROFILE: ${bits.join(", ")}` : "";
}

/** A short note telling the scorer how EUR figures were grounded (EXT-2). */
function costBasisNote(costBasis: CostBasis | null | undefined): string {
  const hasRates = costBasis && Object.keys(costBasis).length > 0;
  const rates = hasRates
    ? Object.entries(costBasis)
        .map(([role, rate]) => `${role} €${rate}/hr`)
        .join(", ")
    : `none provided — assume €${DEFAULT_LOADED_HOURLY_EUR}/hr loaded`;
  return [
    "COST BASIS (loaded hourly rates, EUR): " + rates + ".",
    "Where a capture shows `quantified` with an `implied annual ≈ €X`, that",
    "figure was computed deterministically from the contributor's own numbers —",
    "anchor impactLow/impactHigh and the financial dimension to it, do not invent",
    "a different basis. Captures with no quantified line carry no measured figure.",
  ].join("\n");
}

function scoringSystem(): string {
  return [
    "You score a single discovered operational opportunity for a sponsor who",
    "will decide whether to fund a Twistag FDE engagement. Apply the rubric",
    "below exactly. Be honest and calibrated — over-confident scores erode the",
    "sponsor's trust in the whole report.",
    "",
    "OUTPUT (JSON only):",
    "- title: short, specific, no marketing language.",
    "- description: 1-3 sentences on the opportunity.",
    "- category: a short operational category (e.g. 'Pricing ops', 'Quote-to-cash').",
    "- departments: the affected departments (0-6).",
    "- impactLow / impactHigh: estimated annual EUR impact range (integers,",
    "  impactLow <= impactHigh). Anchor to the Financial-impact table.",
    "- timeToShipWeeksLow / timeToShipWeeksHigh: FDE v1 build weeks (low <= high).",
    "- confidenceScore: 1-5 evidence depth from the Confidence table.",
    "- dimensionScores: an ARRAY of EXACTLY five objects (not an object keyed by",
    "  dimension), one per dimension, each shaped",
    '  {"key": <financial|time_to_ship|ai_suitability|change_mgmt|dependency>,',
    '   "score": 0-10, "reasoning": "one sentence"}.',
    "- rationale: a 100-150 word paragraph per the rubric's Auto-rationale",
    "  section. Cite 2-3 captures by ROLE only (never a name), name the single",
    "  biggest uncertainty, and end with a recommended next step.",
    "- delivery: 'build' | 'buy' | 'configure' per the Delivery-path section —",
    "  be honest, do not manufacture build work. deliveryRationale: one sentence.",
    "- evidenceCaptureIds: the capture ids (from the input) that actually drove",
    "  this score. At least one; prefer the 2-5 strongest.",
    "",
    "DO NOT compute a composite score — that is done downstream. Do NOT include",
    "any individual's name anywhere in your output.",
    "",
    "=== SCORING RUBRIC ===",
    RUBRIC,
  ].join("\n");
}

export type ScoreClusterOpts = {
  theme: string;
  captures: ScoreCapture[];
  tenantName: string;
  /** Per-role loaded hourly rates (EUR). Null → benchmark default (EXT-2). */
  costBasis?: CostBasis | null;
  /** Company profile to ground financial baselines (CTX-4). Null when unknown. */
  companyProfile?: { industry: string | null; sizeBand: string | null } | null;
};

/**
 * The scored opportunity plus the TS-computed composite and the captures the
 * model attributed it to. `composite` is authoritative; the model's view of it
 * (if any) is ignored.
 */
export type ScoredOpportunity = {
  scoring: OpportunityScoring;
  composite: number;
};

/**
 * Score one cluster. Builds the per-capture context (role/department, summary,
 * quote — NO names), calls the model through the Zod-validated structured path
 * (which enforces low<=high and retries once on its own), then computes the
 * composite in TS. The model's `evidenceCaptureIds` are filtered to real input
 * ids so persistence never links a hallucinated capture.
 */
export async function scoreCluster(
  opts: ScoreClusterOpts,
): Promise<ScoredOpportunity> {
  const known = new Set(opts.captures.map((c) => c.id));
  const captureBlock = opts.captures
    .map((c) => {
      const lines = [
        `CAPTURE ${c.id}`,
        `  role: ${c.role}${c.department ? ` · ${c.department}` : ""}`,
        `  kind: ${c.kind}`,
        `  summary: ${c.summary}`,
        `  quote: "${c.sourceQuote}"`,
      ];
      const q = c.quantifiedImpact;
      if (q) {
        const rate = rateForRole(c.role, opts.costBasis);
        const parts: string[] = [];
        if (q.frequencyPerYear != null)
          parts.push(`~${q.frequencyPerYear}×/yr`);
        if (q.unitMinutes != null) parts.push(`${q.unitMinutes} min each`);
        if (q.unitCostUsd != null) parts.push(`€${q.unitCostUsd}/occurrence`);
        if (q.basis) parts.push(`basis: "${q.basis}"`);
        const annual = impliedAnnualUsd(q, rate);
        if (annual != null)
          parts.push(`implied annual ≈ €${annual.toLocaleString("en-US")}`);
        if (parts.length) lines.push(`  quantified: ${parts.join(", ")}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");

  const scoring = await completeStructured({
    system: scoringSystem(),
    schema: opportunityScoring,
    maxTokens: 1536,
    messages: [
      {
        role: "user",
        content: [
          `ORGANIZATION: ${opts.tenantName}`,
          companyProfileLine(opts.companyProfile),
          `CANDIDATE THEME: ${opts.theme}`,
          "",
          costBasisNote(opts.costBasis),
          "",
          "SUPPORTING CAPTURES (attribute by role only, never by name):",
          captureBlock,
        ]
          .filter((line) => line !== "")
          .join("\n"),
      },
    ],
  });

  // Keep only evidence ids that are real input captures (drop hallucinations).
  const evidenceCaptureIds = scoring.evidenceCaptureIds.filter((id) =>
    known.has(id),
  );
  const evidence =
    evidenceCaptureIds.length > 0
      ? evidenceCaptureIds
      : // Model cited only unknown ids — fall back to the whole cluster so the
        // opportunity is never left evidence-less.
        opts.captures.map((c) => c.id);

  const composite = computeComposite(scoring.dimensionScores);

  return {
    scoring: { ...scoring, evidenceCaptureIds: evidence },
    composite,
  };
}
