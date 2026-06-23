import { moneyShort, moneyRange, type Currency } from "./format";
import type { Horizon, Opportunity } from "./types";

/** High-impact = estimated annual impact at/above this band (on the high
 *  estimate). Single source of truth for the high-impact threshold. */
export const HIGH_IMPACT_EUR = 75_000;

/** How many opportunities clear the impact band. */
export function countHighImpact(opps: Pick<Opportunity, "impactHigh">[]): number {
  return opps.filter((o) => o.impactHigh >= HIGH_IMPACT_EUR).length;
}

/**
 * The executive-summary lead clause. Anchors high-impact to money, and NEVER
 * leads with a zero — when the count is 0 it returns the bare opportunity count
 * so the caller phrases the lead around the top opportunity instead.
 */
export function highImpactLead(
  opportunitiesCount: number,
  highImpactCount: number,
  currency: Currency,
): string {
  const opps = `${opportunitiesCount} opportunit${opportunitiesCount === 1 ? "y" : "ies"}`;
  if (highImpactCount <= 0) return opps;
  const band = moneyShort(HIGH_IMPACT_EUR, currency);
  const eachSuffix = highImpactCount === 1 ? "" : " each";
  return `${opps}, ${highImpactCount} of them estimated at ${band}+/yr${eachSuffix}`;
}

/** Honest participation framing — real n + coverage, no vanity percentage. */
export function participationLine(
  participantCount: number,
  scopeDepartment: string,
  capturesCount: number,
): string {
  return `${participantCount} contributor${participantCount === 1 ? "" : "s"} across ${scopeDepartment} · ${capturesCount} captures`;
}

/** One honest confidence sentence (the shown set is corroborated by ≥2). */
export function corroborationLine(opps: Opportunity[]): string {
  if (opps.length === 0) return "";
  return "Every opportunity shown is corroborated by at least two contributors.";
}

const BUCKET: Record<Horizon, string> = {
  quick_win: "Quick wins",
  standard: "Solid bets",
  strategic_bet: "Strategic bets",
};

/** Unified bucket taxonomy used by both the roadmap and the matrix table. */
export function bucketLabel(horizon: Horizon): string {
  return BUCKET[horizon];
}

export type PullQuote = {
  quote: string;
  name: string;
  role: string;
  oppTitle: string;
  corroboration: number;
};

/**
 * Pick up to `n` verbatim, attributed quotes from the highest-ranked
 * opportunities, skipping removed/edited captures and de-duping identical
 * quotes. `opps` is assumed already rank-ordered. Names render in the UI only.
 */
export function selectPullQuotes(opps: Opportunity[], n: number): PullQuote[] {
  const out: PullQuote[] = [];
  const seen = new Set<string>();
  for (const o of opps) {
    for (const c of o.evidence) {
      if (out.length >= n) return out;
      if (c.isRemoved || c.isEdited) continue;
      const q = (c.sourceQuote ?? "").trim();
      if (!q || !c.contributorName || seen.has(q)) continue;
      seen.add(q);
      out.push({
        quote: q,
        name: c.contributorName,
        role: c.contributorRole,
        oppTitle: o.title,
        corroboration: o.contributorCount,
      });
    }
  }
  return out;
}

/**
 * Deterministic narrative fallback for sprints whose synthesis memo hasn't
 * been generated yet. Builds a two-sentence spine from the top opportunity
 * and the aggregate impact of the top five.
 * Returns empty string when there are no opportunities.
 */
export function narrativeFallback(args: {
  scopeDepartment: string;
  participantCount: number;
  opportunitiesCount: number;
  opps: Opportunity[];
  totalLow: number;
  totalHigh: number;
  currency: Currency;
}): string {
  const { opps, currency } = args;
  if (opps.length === 0) return "";
  const top = opps[0];
  const contributors = `${args.participantCount} contributor${args.participantCount === 1 ? "" : "s"}`;
  const opportunities = `${args.opportunitiesCount} opportunit${args.opportunitiesCount === 1 ? "y" : "ies"}`;
  return (
    `Across ${args.scopeDepartment}, ${contributors} surfaced ${opportunities}. ` +
    `The strongest — ${top.title} — is estimated at ${moneyRange(top.impactLow, top.impactHigh, currency)}/yr; ` +
    `together the top five represent ${moneyRange(args.totalLow, args.totalHigh, currency)}/yr in recurring impact.`
  );
}
