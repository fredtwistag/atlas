// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OpportunitiesSection } from "./OpportunitiesSection";
import type { Opportunity } from "@/lib/types";
import type { WorkflowMapView } from "@/services/synthesis/workflows/types";

const opp = (id: string, n: number, title: string): Opportunity =>
  ({ id, compositeScore: n, title, impactLow: 10000, impactHigh: 20000, category: "Ops", horizon: "standard", departments: [], delivery: "build", confidenceScore: 4, dimensionScores: [], evidence: [], contributorCount: 3, rationale: "", description: "", impactHighFmt: "" }) as unknown as Opportunity;
const opps = [opp("o1", 6.7, "First"), opp("o2", 6.5, "Second"), opp("o3", 6.0, "Third"), opp("o4", 5.2, "Fourth")];
const matrix: WorkflowMapView = {
  id: "mx", kind: "impact_effort", title: "Impact vs. effort", basedOnSessions: 0,
  graph: { kind: "impact_effort", title: "Impact vs. effort", lanes: [], steps: [{ id: "p0", label: "First", laneId: null, stepKind: "step", inferred: false, captureIds: [], metric: { x: 2, y: 90 } }], edges: [], confidence: { score: 1, coverage: 1, corroboratedCount: 1, disputedStepIds: [] }, modelVersion: "pure-ts" },
  confidence: { score: 1, coverage: 1, corroboratedCount: 1, disputedStepIds: [] }, evidence: [],
};

describe("OpportunitiesSection", () => {
  it("renders the matrix overview, the top 3, and the rest as a table", () => {
    render(<OpportunitiesSection opps={opps} maps={[matrix]} currency="EUR" href={(id) => `/o/${id}`} />);
    expect(document.querySelector("svg")).not.toBeNull(); // matrix overview
    expect(screen.getByText("First")).toBeTruthy();
    expect(screen.getByText("Fourth")).toBeTruthy(); // in the table
  });
  it("shows an empty state with no opportunities", () => {
    render(<OpportunitiesSection opps={[]} maps={[]} currency="EUR" />);
    expect(screen.getByText(/No opportunities surfaced yet/i)).toBeTruthy();
  });
});
