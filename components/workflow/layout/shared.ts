import type { WorkflowStep } from "@/services/llm/schemas";
import type { LayoutBox, Tone } from "./types";

/**
 * Left-to-right column index per step id, respecting edge direction. Starts
 * every step at column 0 and relaxes: a target sits ≥1 column right of its
 * source. Capped at `stepIds.length` passes so a cycle terminates.
 */
export function assignColumns(
  stepIds: string[],
  edges: { from: string; to: string }[],
): Map<string, number> {
  const col = new Map<string, number>();
  for (const id of stepIds) col.set(id, 0);
  for (let pass = 0; pass < stepIds.length; pass++) {
    let changed = false;
    for (const e of edges) {
      if (!col.has(e.from) || !col.has(e.to)) continue;
      const want = (col.get(e.from) as number) + 1;
      if ((col.get(e.to) as number) < want) {
        col.set(e.to, want);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return col;
}

export function stepTone(step: WorkflowStep): Tone {
  if (step.inferred) return "gray";
  switch (step.stepKind) {
    case "bottleneck":
    case "gap":
      return "red";
    case "shadow_tool":
      return "amber";
    case "start":
    case "end":
      return "gray";
    default:
      return "blue";
  }
}

export function stepShape(step: WorkflowStep): "rect" | "diamond" | "circle" {
  return step.stepKind === "decision" ? "diamond" : "rect";
}

/** Orthogonal connector from a's right edge to b's left edge; L-bend across rows. */
export function routeEdge(a: LayoutBox, b: LayoutBox): { x: number; y: number }[] {
  const start = { x: a.x + a.w, y: a.y + a.h / 2 };
  const end = { x: b.x - 8, y: b.y + b.h / 2 };
  if (Math.abs(start.y - end.y) < 1) return [start, end];
  const midX = (start.x + b.x) / 2;
  return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
}
