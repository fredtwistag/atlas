import { describe, it, expect } from "vitest";
import { assignColumns, stepTone, stepShape, routeEdge, wrapLines, cardHeight } from "./shared";
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

describe("wrapLines", () => {
  it("keeps short text on one line", () => {
    expect(wrapLines("a short line", 40, 2)).toEqual(["a short line"]);
  });
  it("wraps long text across up to two lines", () => {
    const lines = wrapLines("one two three four five six seven eight nine ten", 20, 2);
    expect(lines.length).toBe(2);
    lines.forEach((l) => expect(l.length).toBeLessThanOrEqual(21));
  });
  it("ellipsizes when text overflows the line budget", () => {
    const lines = wrapLines("alpha beta gamma delta epsilon zeta eta theta iota kappa lambda", 18, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith("…")).toBe(true);
  });
  it("returns [] for empty input", () => {
    expect(wrapLines("   ", 40, 2)).toEqual([]);
  });
});

describe("cardHeight", () => {
  it("grows with extra title and description lines", () => {
    const base = cardHeight(1, 1);
    expect(cardHeight(2, 1)).toBeGreaterThan(base); // extra title line is taller
    expect(cardHeight(1, 2)).toBeGreaterThan(base); // extra body line is taller
    expect(cardHeight(1, 0)).toBeLessThan(base);    // no description is shorter
  });
});
