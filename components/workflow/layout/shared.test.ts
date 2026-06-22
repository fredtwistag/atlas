import { describe, it, expect } from "vitest";
import { assignColumns, stepTone, stepShape, routeEdge, routeEdgeVertical } from "./shared";
import type { WorkflowStep } from "@/services/llm/schemas";
import type { LayoutBox } from "./types";

function step(p: Partial<WorkflowStep>): WorkflowStep {
  return { id: "s", label: "x", laneId: null, stepKind: "step", inferred: false, captureIds: [], metric: null, ...p };
}

describe("assignColumns", () => {
  it("places each target at least one column right of its source", () => {
    const cols = assignColumns(["a", "b", "c"], [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ]);
    expect(cols.get("a")).toBe(0);
    expect(cols.get("b")).toBe(1);
    expect(cols.get("c")).toBe(2);
  });

  it("terminates on a cycle without throwing", () => {
    const cols = assignColumns(["a", "b"], [
      { from: "a", to: "b" },
      { from: "b", to: "a" },
    ]);
    expect(cols.size).toBe(2);
  });
});

describe("stepTone / stepShape", () => {
  it("maps bottleneck and gap to red, shadow_tool to amber, inferred to gray", () => {
    expect(stepTone(step({ stepKind: "bottleneck" }))).toBe("red");
    expect(stepTone(step({ stepKind: "gap" }))).toBe("red");
    expect(stepTone(step({ stepKind: "shadow_tool" }))).toBe("amber");
    expect(stepTone(step({ inferred: true, stepKind: "step" }))).toBe("gray");
    expect(stepTone(step({ stepKind: "step" }))).toBe("blue");
  });
  it("uses a diamond only for decisions", () => {
    expect(stepShape(step({ stepKind: "decision" }))).toBe("diamond");
    expect(stepShape(step({ stepKind: "step" }))).toBe("rect");
  });
});

describe("routeEdge", () => {
  const a: LayoutBox = { id: "a", x: 0, y: 0, w: 100, h: 40, title: "", subtitle: null, tone: "blue", shape: "rect", dashed: false };
  it("is a straight 2-point line when boxes share a row", () => {
    const b: LayoutBox = { ...a, id: "b", x: 200, y: 0 };
    expect(routeEdge(a, b)).toHaveLength(2);
  });
  it("bends (≥3 points) when boxes are on different rows", () => {
    const b: LayoutBox = { ...a, id: "b", x: 200, y: 120 };
    expect(routeEdge(a, b).length).toBeGreaterThanOrEqual(3);
  });
});

const mk = (y: number) => ({ id: "x", x: 110, y, w: 460, h: 74, title: "", subtitle: null, tone: "blue" as const, shape: "rect" as const, dashed: false });

describe("routeEdgeVertical", () => {
  it("draws a straight connector between adjacent stacked cards", () => {
    const pts = routeEdgeVertical(mk(20), mk(116), 22); // 116 = 20+74+22
    expect(pts).toHaveLength(2);
    expect(pts[0].x).toBe(pts[1].x); // same centre x
  });
  it("routes a skip/back edge around the side", () => {
    const pts = routeEdgeVertical(mk(20), mk(300), 22);
    expect(pts.length).toBeGreaterThan(2);
  });
});
