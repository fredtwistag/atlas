import type { WorkflowGraph } from "@/services/synthesis/workflows/types";
import type { Layout, LayoutBox, Tone } from "./layout/types";
import { layoutSwimlane } from "./layout/swimlane";
import { layoutTopology } from "./layout/topology";
import { layoutMatrix } from "./layout/matrix";

const TONE: Record<Tone, { fill: string; stroke: string; text: string }> = {
  blue: { fill: "var(--blue-100)", stroke: "var(--blue-700)", text: "var(--blue-1000)" },
  amber: { fill: "var(--amber-100)", stroke: "var(--amber-800)", text: "var(--amber-1000)" },
  red: { fill: "var(--red-100)", stroke: "var(--red-800)", text: "var(--red-1000)" },
  green: { fill: "var(--green-100)", stroke: "var(--green-800)", text: "var(--green-1000)" },
  purple: { fill: "var(--purple-100)", stroke: "var(--purple-700)", text: "var(--purple-1000)" },
  gray: { fill: "var(--surface-2)", stroke: "var(--border-strong)", text: "var(--text)" },
};

function pickLayout(graph: WorkflowGraph): Layout | null {
  switch (graph.kind) {
    case "swimlane":
      return layoutSwimlane(graph);
    case "systems_topology":
      return layoutTopology(graph);
    case "impact_effort":
      return layoutMatrix(graph);
    default:
      return null; // Plan 3 / fast-follow kinds not yet rendered
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function Box({ box }: { box: LayoutBox }) {
  const c = TONE[box.tone];
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dash = box.dashed ? "4 3" : undefined;
  return (
    <g>
      {box.shape === "circle" ? (
        <circle cx={cx} cy={cy} r={box.w / 2} fill={c.fill} stroke={c.stroke} strokeWidth={1} strokeDasharray={dash} />
      ) : box.shape === "diamond" ? (
        <polygon
          points={`${cx},${box.y} ${box.x + box.w},${cy} ${cx},${box.y + box.h} ${box.x},${cy}`}
          fill={c.fill}
          stroke={c.stroke}
          strokeWidth={1}
          strokeDasharray={dash}
        />
      ) : (
        <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={8} fill={c.fill} stroke={c.stroke} strokeWidth={1} strokeDasharray={dash} />
      )}
      {box.title ? (
        <text x={cx} y={box.subtitle ? cy - 7 : cy} textAnchor="middle" dominantBaseline="central" fontSize={box.shape === "circle" ? 11 : 13} fontWeight={500} fill={c.text}>
          {truncate(box.title, 20)}
        </text>
      ) : null}
      {box.subtitle ? (
        <text x={cx} y={cy + 9} textAnchor="middle" dominantBaseline="central" fontSize={11} fill={c.text} opacity={0.75}>
          {box.subtitle}
        </text>
      ) : null}
    </g>
  );
}

/** Deterministic SVG renderer for a workflow graph. Pure: no hooks, no I/O. */
export function WorkflowDiagram({ graph, instanceId }: { graph: WorkflowGraph; instanceId?: string }) {
  const markerId = `wf-arrow-${(instanceId ?? "x").replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const layout = pickLayout(graph);
  if (!layout) return null;
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="img"
      aria-label={graph.title}
      preserveAspectRatio="xMidYMid meet"
      className="not-prose"
    >
      <title>{graph.title}</title>
      <defs>
        <marker id={markerId} viewBox="0 0 10 10" refX={8} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
          <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>

      {layout.lanes.map((lane, i) => (
        <g key={lane.id}>
          <rect x={40} y={lane.y} width={layout.width - 80} height={lane.h} fill={i % 2 ? "var(--surface-2)" : "var(--surface)"} stroke="var(--border)" strokeWidth={0.5} />
          <text x={95} y={lane.y + lane.h / 2} textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight={500} fill="var(--text-2)">
            {lane.label}
          </text>
        </g>
      ))}

      {layout.lines.map((ln, i) => (
        <line key={i} x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2} stroke={ln.dashed ? "var(--text-faint)" : "var(--border-strong)"} strokeWidth={0.75} strokeDasharray={ln.dashed ? "4 4" : undefined} />
      ))}

      {layout.edges.map((e) => (
        <polyline key={e.id} points={e.points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={e.tone === "red" ? "var(--red-700)" : "var(--text-3)"} strokeWidth={1.5} strokeDasharray={e.dashed ? "5 4" : undefined} markerEnd={`url(#${markerId})`} />
      ))}

      {layout.boxes.map((b) => (
        <Box key={b.id} box={b} />
      ))}

      {layout.texts.map((t, i) => (
        <text key={i} x={t.x} y={t.y} textAnchor={t.anchor} dominantBaseline="central" fontSize={12} fill={t.muted ? "var(--text-3)" : "var(--text)"}>
          {t.text}
        </text>
      ))}
    </svg>
  );
}
