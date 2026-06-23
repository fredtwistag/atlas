import type { WorkflowGraph } from "@/services/synthesis/workflows/types";
import type { Layout, LayoutBox, LayoutLine, LayoutText, Tone } from "./types";

const PLOT_X0 = 150;
const PLOT_X1 = 560;
const PLOT_Y0 = 70;
const PLOT_Y1 = 320;
const R = 10;

function quadrantTone(x: number, y: number, mx: number, my: number): Tone {
  const lowEffort = x <= mx;
  const highImpact = y >= my;
  if (lowEffort && highImpact) return "green"; // quick win
  if (!lowEffort && highImpact) return "purple"; // big bet
  return "gray";
}

export function layoutMatrix(graph: WorkflowGraph): Layout {
  const pts = graph.steps
    .filter((s) => s.metric)
    .map((s) => ({ id: s.id, x: s.metric!.x, y: s.metric!.y }));

  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const xMin = Math.min(...xs, 0);
  const xMax = Math.max(...xs, 1);
  const yMin = Math.min(...ys, 0);
  const yMax = Math.max(...ys, 1);
  const mx = (xMin + xMax) / 2;
  const my = (yMin + yMax) / 2;

  const sx = (x: number) =>
    PLOT_X0 + ((x - xMin) / (xMax - xMin || 1)) * (PLOT_X1 - PLOT_X0);
  const sy = (y: number) =>
    PLOT_Y1 - ((y - yMin) / (yMax - yMin || 1)) * (PLOT_Y1 - PLOT_Y0);

  const boxes: LayoutBox[] = pts.map((p, i) => ({
    id: p.id,
    x: sx(p.x) - R,
    y: sy(p.y) - R,
    w: R * 2,
    h: R * 2,
    title: String(i + 1),
    subtitle: null,
    tone: quadrantTone(p.x, p.y, mx, my),
    shape: "circle",
    dashed: false,
  }));

  const midX = (PLOT_X0 + PLOT_X1) / 2;
  const midY = (PLOT_Y0 + PLOT_Y1) / 2;
  const lines: LayoutLine[] = [
    { x1: PLOT_X0, y1: PLOT_Y0, x2: PLOT_X0, y2: PLOT_Y1, dashed: false },
    { x1: PLOT_X0, y1: PLOT_Y1, x2: PLOT_X1, y2: PLOT_Y1, dashed: false },
    { x1: midX, y1: PLOT_Y0, x2: midX, y2: PLOT_Y1, dashed: true },
    { x1: PLOT_X0, y1: midY, x2: PLOT_X1, y2: midY, dashed: true },
  ];

  const texts: LayoutText[] = [
    { x: PLOT_X0, y: PLOT_Y0 - 12, text: "Higher impact", anchor: "start", muted: true },
    { x: PLOT_X1, y: PLOT_Y1 + 24, text: "Higher effort", anchor: "end", muted: true },
  ];

  return { width: 680, height: 360, lanes: [], boxes, edges: [], lines, texts };
}
