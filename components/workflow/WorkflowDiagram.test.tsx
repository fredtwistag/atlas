// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { WorkflowDiagram } from "./WorkflowDiagram";
import type { WorkflowGraph } from "@/services/synthesis/workflows/types";

const swimlane: WorkflowGraph = {
  kind: "swimlane",
  title: "Deal to order",
  lanes: [{ id: "l1", roleLabel: "Sales", department: null }],
  steps: [
    { id: "s1", label: "Log deal", laneId: "l1", stepKind: "step", inferred: false, captureIds: [], metric: null },
    { id: "s2", label: "Inferred link", laneId: "l1", stepKind: "step", inferred: true, captureIds: [], metric: null },
  ],
  edges: [{ id: "e1", from: "s1", to: "s2", edgeKind: "flow", label: null, inferred: false, captureIds: [] }],
  confidence: { score: 0.8, coverage: 1, corroboratedCount: 1, disputedStepIds: [] },
  modelVersion: "m",
};

describe("WorkflowDiagram", () => {
  it("renders an svg containing the step labels", () => {
    const { container } = render(<WorkflowDiagram graph={swimlane} />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).toContain("Log deal");
  });
  it("renders inferred elements dashed", () => {
    const { container } = render(<WorkflowDiagram graph={swimlane} />);
    expect(container.querySelectorAll("[stroke-dasharray]").length).toBeGreaterThan(0);
  });
  it("renders nothing for an unsupported kind", () => {
    const { container } = render(
      <WorkflowDiagram graph={{ ...swimlane, kind: "raci_grid" }} />,
    );
    expect(container.querySelector("svg")).toBeNull();
  });
});
