import type { Opportunity, SowDraft } from "./types";

/**
 * Heuristic SOW draft from an opportunity. Server-safe (no mock-sprint
 * dependency) — takes the tenant name explicitly. The LLM-generated version is
 * ATL-502 (deferred); this is the templated draft persisted on approval.
 */
export function buildSowDraft(opp: Opportunity, tenantName: string): SowDraft {
  // Ticket C: a `buy` opportunity is a vendor-selection + integration
  // engagement, not a custom build — scope it honestly rather than inventing
  // build work. (`configure` still fits the build-style template: it's
  // implementation work on an owned system.)
  if (opp.delivery === "buy") {
    return {
      title: `${opp.title} — vendor selection & integration`,
      scope: `Select and integrate a vendor solution for the ${opp.title.toLowerCase()} need at ${tenantName}: shortlist mature products, run a structured evaluation against the captured requirements, and integrate the chosen tool with the existing system of record. No custom build of the core capability.`,
      inclusions: [
        "Requirements confirmation from the discovery evidence (½ day)",
        "Vendor shortlist + structured evaluation/scorecard",
        "Integration of the selected tool with the system of record",
        "Two-week hypercare after go-live",
      ],
      exclusions: [
        "Custom build of capability a vendor already provides",
        "Vendor license/subscription fees (billed by the vendor)",
      ],
      team: [
        { role: "Forward-Deployed Engineer (lead)", allocation: "Full-time" },
        { role: "Engagement lead", allocation: "Oversight" },
      ],
      durationWeeks: opp.timeToShipWeeksHigh,
      priceUsd: 48_000,
      successMetrics: [
        "Vendor selected with a documented evaluation the sponsor signs off",
        "Integrated and live within the target window",
        "≥80% of eligible cases handled by the selected tool",
      ],
    };
  }
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
