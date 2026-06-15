import type {
  SprintProgress,
  Opportunity,
  Capture,
  DimensionScore,
} from "./types";

/** Compute the dashboard stat strip from assembled rows. */
export function computeProgress(args: {
  participants: {
    sessionsCompleted: number;
    sessionsTotal: number;
    status: string;
  }[];
  opportunities: { compositeScore: number }[];
  capturesCount: number;
  signalQuality: number;
}): SprintProgress {
  const sessionsCompleted = args.participants.reduce(
    (s, p) => s + p.sessionsCompleted,
    0,
  );
  const sessionsTotal = args.participants.reduce(
    (s, p) => s + p.sessionsTotal,
    0,
  );
  return {
    completionPct: sessionsTotal
      ? Math.round((sessionsCompleted / sessionsTotal) * 100)
      : 0,
    weeklyActiveContributors: args.participants.filter(
      (p) => p.status === "in_progress" || p.status === "completed",
    ).length,
    participantCount: args.participants.length,
    sessionsCompleted,
    sessionsTotal,
    opportunitiesCount: args.opportunities.length,
    highImpactCount: args.opportunities.filter((o) => o.compositeScore >= 7.5)
      .length,
    capturesCount: args.capturesCount,
    signalQuality: args.signalQuality,
  };
}

/** A DB opportunity row (composite_score arrives as a string from postgres-js). */
export interface OpportunityRow {
  id: string;
  sprintId: string;
  title: string;
  description: string;
  category: string;
  departments: string[];
  impactLow: number;
  impactHigh: number;
  timeToShipWeeksLow: number;
  timeToShipWeeksHigh: number;
  confidenceScore: number;
  compositeScore: string;
  horizon: string;
  delivery: string;
  deliveryRationale: string;
  dimensionScores: unknown;
  rationale: string;
  status: string;
  contributorCount: number;
  patternMatch: unknown;
}

export function toOpportunity(
  row: OpportunityRow,
  evidence: Capture[],
): Opportunity {
  return {
    id: row.id,
    sprintId: row.sprintId,
    title: row.title,
    description: row.description,
    category: row.category,
    departments: row.departments,
    impactLow: row.impactLow,
    impactHigh: row.impactHigh,
    timeToShipWeeksLow: row.timeToShipWeeksLow,
    timeToShipWeeksHigh: row.timeToShipWeeksHigh,
    confidenceScore: row.confidenceScore,
    compositeScore: Number(row.compositeScore),
    horizon: (row.horizon as Opportunity["horizon"]) ?? "standard",
    delivery: (row.delivery as Opportunity["delivery"]) ?? "build",
    deliveryRationale: row.deliveryRationale ?? "",
    dimensionScores: (row.dimensionScores as DimensionScore[]) ?? [],
    rationale: row.rationale,
    status: row.status as Opportunity["status"],
    contributorCount: row.contributorCount,
    patternMatch:
      (row.patternMatch as Opportunity["patternMatch"]) ?? undefined,
    evidence,
  };
}
