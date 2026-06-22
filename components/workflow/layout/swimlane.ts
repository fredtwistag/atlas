import type { WorkflowGraph } from "@/services/synthesis/workflows/types";
import type { Layout, LayoutBox, LayoutEdge } from "./types";
import { assignColumns, stepTone, wrapLines } from "./shared";

const WIDTH = 680;
const CARD_W = 460;
const CARD_X = (WIDTH - CARD_W) / 2; // 110
const GAP = 20;
const TOP = 20;
const TITLE_BLOCK = 50; // chip + title region above the description
const LINE_H = 16; // description line height
const BOTTOM_PAD = 16; // breathing room under the last line
const DESC_MAX_CHARS = 66;
const DESC_MAX_LINES = 2;

/**
 * Vertical card stack: one column of full-width cards, role chip per card, the
 * step's evidence description wrapped across up to two lines. Card height grows
 * to fit its description (with bottom padding). Lanes are not drawn as bands —
 * the chip carries the role, so handoffs read as the chip changing. Connectors
 * are clean sequential down-arrows (dashed when an inferred step is involved);
 * the red BOXES carry the bottleneck signal, so connectors are never coloured.
 */
export function layoutSwimlane(graph: WorkflowGraph): Layout {
  const laneLabel = new Map(graph.lanes.map((l) => [l.id, l.roleLabel]));
  const col = assignColumns(graph.steps.map((s) => s.id), graph.edges);
  const ordered = [...graph.steps].sort(
    (a, b) => (col.get(a.id) as number) - (col.get(b.id) as number),
  );

  const boxes: LayoutBox[] = [];
  let y = TOP;
  for (const step of ordered) {
    const desc = step.inferred ? "inferred" : (step.detail ?? null);
    const bodyLines = step.inferred
      ? ["inferred"]
      : desc
        ? wrapLines(desc, DESC_MAX_CHARS, DESC_MAX_LINES)
        : [];
    const h = TITLE_BLOCK + bodyLines.length * LINE_H + BOTTOM_PAD;
    boxes.push({
      id: step.id,
      x: CARD_X,
      y,
      w: CARD_W,
      h,
      title: step.label,
      subtitle: desc,
      bodyLines,
      chip: laneLabel.get(step.laneId ?? "") ?? null,
      tone: stepTone(step),
      shape: "rect",
      dashed: step.inferred,
    });
    y += h + GAP;
  }

  const edges: LayoutEdge[] = [];
  for (let i = 0; i < boxes.length - 1; i++) {
    const a = boxes[i];
    const b = boxes[i + 1];
    const x = a.x + a.w / 2;
    edges.push({
      id: `seq-${i}`,
      points: [
        { x, y: a.y + a.h },
        { x, y: b.y - 6 },
      ],
      dashed: a.dashed || b.dashed,
      tone: "gray",
    });
  }

  return {
    width: WIDTH,
    height: Math.max(TOP + 40, y - GAP + BOTTOM_PAD),
    lanes: [],
    boxes,
    edges,
    lines: [],
    texts: [],
  };
}
