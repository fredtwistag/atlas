import type { WorkflowGraph } from "@/services/synthesis/workflows/types";
import type { Layout, LayoutBox, LayoutEdge, LayoutLane } from "./types";
import { assignColumns, routeEdge, stepShape, stepTone } from "./shared";

const LABEL_W = 110;
const LANE_H = 76;
const X0 = LABEL_W + 40;
const STEP_W = 130;
const STEP_H = 44;
const GAP = 40;
const TOP = 56;

export function layoutSwimlane(graph: WorkflowGraph): Layout {
  const lanes =
    graph.lanes.length > 0
      ? graph.lanes
      : [{ id: "_all", roleLabel: "Workflow", department: null }];
  const laneIndex = new Map(lanes.map((l, i) => [l.id, i]));

  const col = assignColumns(graph.steps.map((s) => s.id), graph.edges);
  const ordered = [...graph.steps].sort(
    (a, b) => (col.get(a.id) as number) - (col.get(b.id) as number),
  );

  const slotByLane = new Map<number, number>();
  const boxes: LayoutBox[] = [];
  const boxById = new Map<string, LayoutBox>();

  for (const step of ordered) {
    const li = laneIndex.get(step.laneId ?? "") ?? 0;
    const slot = slotByLane.get(li) ?? 0;
    slotByLane.set(li, slot + 1);
    const box: LayoutBox = {
      id: step.id,
      x: X0 + slot * (STEP_W + GAP),
      y: TOP + li * LANE_H + (LANE_H - STEP_H) / 2,
      w: STEP_W,
      h: STEP_H,
      title: step.label,
      subtitle: step.inferred ? "inferred" : null,
      tone: stepTone(step),
      shape: stepShape(step),
      dashed: step.inferred,
    };
    boxes.push(box);
    boxById.set(step.id, box);
  }

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
  const layoutLanes: LayoutLane[] = lanes.map((l, i) => ({
    id: l.id,
    label: l.roleLabel,
    y: TOP + i * LANE_H,
    h: LANE_H,
  }));

  return {
    width: Math.max(680, maxRight + 40),
    height: TOP + lanes.length * LANE_H + 24,
    lanes: layoutLanes,
    boxes,
    edges,
    lines: [],
    texts: [],
  };
}
