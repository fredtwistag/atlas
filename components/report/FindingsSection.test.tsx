// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FindingsSection } from "./FindingsSection";
import type { WorkflowMapView } from "@/services/synthesis/workflows/types";

const mk = (id: string, kind: WorkflowMapView["kind"], title: string): WorkflowMapView => ({
  id, kind, title, basedOnSessions: 1,
  graph: { kind, title, lanes: [], steps: [{ id: "s", label: "x", laneId: null, stepKind: "step", inferred: false, captureIds: [], metric: kind === "impact_effort" ? { x: 1, y: 1 } : null }], edges: [], confidence: { score: 1, coverage: 1, corroboratedCount: 1, disputedStepIds: [] }, modelVersion: "m" },
  confidence: { score: 1, coverage: 1, corroboratedCount: 1, disputedStepIds: [] }, evidence: [],
});

describe("FindingsSection", () => {
  it("renders swimlane + topology maps but NOT the impact_effort matrix", () => {
    render(<FindingsSection maps={[mk("a", "swimlane", "Flow finding"), mk("b", "systems_topology", "Systems finding"), mk("c", "impact_effort", "Matrix")]} />);
    // WorkflowDiagram renders the title as both an h3 and an SVG <title>; use getAllByText
    expect(screen.getAllByText("Flow finding").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Systems finding").length).toBeGreaterThan(0);
    expect(screen.queryByText("Matrix")).toBeNull();
  });
  it("renders nothing when there are no findings maps", () => {
    const { container } = render(<FindingsSection maps={[mk("c", "impact_effort", "Matrix")]} />);
    expect(container.textContent).toBe("");
  });
});
