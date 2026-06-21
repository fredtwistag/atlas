// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InsightCard } from "./InsightCard";
import type { WorkflowMapView } from "@/services/synthesis/workflows/types";

const map: WorkflowMapView = {
  id: "m1",
  kind: "swimlane",
  title: "Most of an order's lead time is spent re-keying into the ERP.",
  basedOnSessions: 3,
  graph: { kind: "swimlane", title: "x", lanes: [], steps: [{ id: "s1", label: "Re-key", laneId: null, stepKind: "bottleneck", inferred: false, captureIds: [], metric: null }], edges: [], confidence: { score: 0.8, coverage: 1, corroboratedCount: 2, disputedStepIds: [] }, modelVersion: "m" },
  confidence: { score: 0.8, coverage: 1, corroboratedCount: 2, disputedStepIds: [] },
  evidence: [{ id: "c1", kind: "bottleneck", summary: "we re-key everything", sourceQuote: "I retype it all by hand", contributorName: "Dana Rep", contributorRole: "Ops", tags: [] }],
};

describe("InsightCard", () => {
  it("renders the headline, an svg diagram, the session basis, and the evidence quote", () => {
    render(<InsightCard map={map} />);
    expect(screen.getByText(/spent re-keying into the ERP/)).toBeTruthy();
    expect(document.querySelector("svg")).not.toBeNull();
    expect(screen.getByText(/Based on 3 sessions/)).toBeTruthy();
    expect(screen.getByText(/Dana Rep/)).toBeTruthy();
  });
});
