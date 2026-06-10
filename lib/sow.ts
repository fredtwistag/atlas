import type { Opportunity, SowDraft } from "./types";

/**
 * Heuristic SOW draft from an opportunity. Server-safe (no mock-sprint
 * dependency) — takes the tenant name explicitly. The LLM-generated version is
 * ATL-502 (deferred); this is the templated draft persisted on approval.
 */
export function buildSowDraft(opp: Opportunity, tenantName: string): SowDraft {
  return {
    title: `${opp.title} — discovery-to-ship engagement`,
    scope: `Design and ship the ${opp.title.toLowerCase()} capability for ${tenantName}, covering the rules-based majority of cases with a clean exception path for the remainder. Includes integration with the existing systems, a review queue for edge cases, and rollout support.`,
    inclusions: [
      "Discovery confirmation workshop (½ day)",
      "Core implementation for the affected workflow",
      "Integration with the existing system of record",
      "Two-week hypercare after go-live",
    ],
    exclusions: [
      "Changes to upstream configuration beyond the affected workflow",
      "New vendor or carrier integrations not named above",
    ],
    team: [
      { role: "Forward-Deployed Engineer (lead)", allocation: "Full-time" },
      { role: "Forward-Deployed Engineer", allocation: "Half-time" },
      { role: "Engagement lead", allocation: "Oversight" },
    ],
    durationWeeks: opp.timeToShipWeeksHigh,
    priceUsd: 68_000,
    successMetrics: [
      "≥80% of eligible cases auto-processed within target SLA",
      "Median cycle-time materially reduced vs. the manual baseline",
      "Zero increase in error/dispute rate vs. baseline",
    ],
  };
}
