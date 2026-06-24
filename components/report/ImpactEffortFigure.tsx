"use client";

import { useEffect, useRef, useState } from "react";
import { WorkflowDiagram } from "@/components/workflow/WorkflowDiagram";
import { bucketLabel } from "@/lib/report-content";
import type { Opportunity } from "@/lib/types";
import type { WorkflowGraph } from "@/services/synthesis/workflows/types";

/**
 * The report's impact/effort matrix paired with its legend table, linked by a
 * shared hover state: hovering a circle highlights its table row, and hovering
 * a row rings the matching circle. The matrix dots and the rows share an index
 * (the matrix box id is `opp-<i>`, in the same order as `opps`).
 */
export function ImpactEffortFigure({
  graph,
  instanceId,
  opps,
}: {
  graph: WorkflowGraph;
  instanceId: string;
  opps: Opportunity[];
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const svgWrap = useRef<HTMLDivElement>(null);

  // Mirror `hovered` onto the SVG: ring the matching circle. Driven by an
  // effect so both directions (circle→row and row→circle) share one source.
  useEffect(() => {
    const root = svgWrap.current;
    if (!root) return;
    root.querySelectorAll<SVGGElement>("[data-step-id]").forEach((g) => {
      const idx = stepIndex(g.getAttribute("data-step-id"));
      g.classList.toggle("ief-hl", idx !== null && idx === hovered);
    });
  }, [hovered]);

  return (
    <div>
      <style>{`.ief-hl > circle { stroke: var(--brand); stroke-width: 2.5px; }`}</style>
      <div
        ref={svgWrap}
        onMouseOver={(e) =>
          setHovered(stepIndex((e.target as Element).closest?.("[data-step-id]")?.getAttribute("data-step-id") ?? null))
        }
        onMouseLeave={() => setHovered(null)}
      >
        <WorkflowDiagram graph={graph} instanceId={instanceId} />
      </div>
      <table className="mt-4 w-full text-left text-sm">
        <caption className="sr-only">
          Opportunities by estimated impact, effort, and bucket
        </caption>
        <thead>
          <tr className="text-xs text-text-3">
            <th scope="col" className="py-1 pr-3 font-medium">#</th>
            <th scope="col" className="py-1 pr-3 font-medium">Opportunity</th>
            <th scope="col" className="py-1 pr-3 font-medium">Bucket</th>
          </tr>
        </thead>
        <tbody>
          {opps.map((o, i) => (
            <tr
              key={o.id}
              className={`border-t border-border transition-colors ${hovered === i ? "bg-surface-2" : ""}`}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              <td className="py-1.5 pr-3 text-text-3">{i + 1}</td>
              <td className="py-1.5 pr-3 text-text-2">{o.title}</td>
              <td className="py-1.5 pr-3 text-text-2">{bucketLabel(o.horizon)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "opp-3" → 3; null for anything without a trailing integer. */
function stepIndex(id: string | null): number | null {
  if (!id) return null;
  const m = /(\d+)$/.exec(id);
  return m ? Number(m[1]) : null;
}
