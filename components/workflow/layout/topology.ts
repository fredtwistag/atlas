import type { WorkflowGraph } from "@/services/synthesis/workflows/types";
import type { WorkflowStep } from "@/services/llm/schemas";
import type { Layout, LayoutBox, LayoutEdge } from "./types";
import { assignColumns, routeEdge, stepTone } from "./shared";

const X0 = 60;
const Y = 90;
const STEP_W = 150;
const STEP_H = 56;
const GAP = 56;

function subtitle(step: WorkflowStep): string | null {
  if (step.inferred) return "inferred";
  if (step.stepKind === "shadow_tool") return "shadow tool";
  if (step.stepKind === "system") return "system";
  return null;
}

export function layoutTopology(graph: WorkflowGraph): Layout {
  const col = assignColumns(graph.steps.map((s) => s.id), graph.edges);
  const ordered = [...graph.steps].sort(
    (a, b) => (col.get(a.id) as number) - (col.get(b.id) as number),
  );

  const boxes: LayoutBox[] = [];
  const boxById = new Map<string, LayoutBox>();
  ordered.forEach((step, i) => {
    const box: LayoutBox = {
      id: step.id,
      x: X0 + i * (STEP_W + GAP),
      y: Y,
      w: STEP_W,
      h: STEP_H,
      title: step.label,
      subtitle: subtitle(step),
      tone: stepTone(step),
      shape: "rect",
      dashed: step.inferred,
    };
    boxes.push(box);
    boxById.set(step.id, box);
  });

  const edges: LayoutEdge[] = [];
  for (const e of graph.edges) {
    const a = boxById.get(e.from);
    const b = boxById.get(e.to);
    if (!a || !b) continue;
    edges.push({
      id: e.id,
      points: routeEdge(a, b),
      dashed: e.inferred || e.edgeKind === "gap",
      tone: e.edgeKind === "gap" ? "red" : "gray",
    });
  }

  const maxRight = boxes.reduce((m, b) => Math.max(m, b.x + b.w), X0);
  return {
    width: Math.max(680, maxRight + 40),
    height: Y + STEP_H + 40,
    lanes: [],
    boxes,
    edges,
    lines: [],
    texts: [],
  };
}
