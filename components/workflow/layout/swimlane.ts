import type { WorkflowGraph } from "@/services/synthesis/workflows/types";
import type { Layout, LayoutBox, LayoutEdge } from "./types";
import { assignColumns, routeEdgeVertical, stepTone } from "./shared";

const WIDTH = 680;
const CARD_W = 460;
const CARD_H = 74;
const CARD_X = (WIDTH - CARD_W) / 2; // 110
const GAP = 22;
const TOP = 20;

/** Vertical card stack: one column of full-width cards, role chip per card, the
 * step's evidence description as the subtitle. Lanes are not drawn as bands —
 * the chip carries the role, so handoffs read as the chip changing. */
export function layoutSwimlane(graph: WorkflowGraph): Layout {
  const laneLabel = new Map(graph.lanes.map((l) => [l.id, l.roleLabel]));
  const col = assignColumns(graph.steps.map((s) => s.id), graph.edges);
  const ordered = [...graph.steps].sort(
    (a, b) => (col.get(a.id) as number) - (col.get(b.id) as number),
  );

  const boxes: LayoutBox[] = [];
  const boxById = new Map<string, LayoutBox>();
  let y = TOP;
  for (const step of ordered) {
    const box: LayoutBox = {
      id: step.id,
      x: CARD_X,
      y,
      w: CARD_W,
      h: CARD_H,
      title: step.label,
      subtitle: step.inferred ? "inferred" : (step.detail ?? null),
      chip: laneLabel.get(step.laneId ?? "") ?? null,
      tone: stepTone(step),
      shape: "rect",
      dashed: step.inferred,
    };
    boxes.push(box);
    boxById.set(step.id, box);
    y += CARD_H + GAP;
  }

  const edges: LayoutEdge[] = [];
  for (const e of graph.edges) {
    const a = boxById.get(e.from);
    const b = boxById.get(e.to);
    if (!a || !b) continue;
    edges.push({
      id: e.id,
      points: routeEdgeVertical(a, b, GAP),
      dashed: e.inferred || e.edgeKind === "gap",
      tone: e.edgeKind === "gap" ? "red" : "gray",
    });
  }

  return {
    width: WIDTH,
    height: Math.max(TOP + 40, y - GAP + 24),
    lanes: [],
    boxes,
    edges,
    lines: [],
    texts: [],
  };
}
