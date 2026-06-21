import { WorkflowDiagram } from "@/components/workflow/WorkflowDiagram";
import type { WorkflowMapView } from "@/services/synthesis/workflows/types";

/**
 * A finding: a workflow map promoted to a headline insight, with the diagram
 * as evidence and the name+role-attributed quotes one click away.
 */
export function InsightCard({ map }: { map: WorkflowMapView }) {
  return (
    <figure className="rounded-lg border border-border bg-surface p-5">
      <figcaption className="mb-1 flex items-start justify-between gap-3">
        <h3 className="text-md font-medium leading-snug text-text">{map.title}</h3>
        <span className="shrink-0 text-xs text-text-3">
          Based on {map.basedOnSessions} session{map.basedOnSessions === 1 ? "" : "s"}
        </span>
      </figcaption>
      <div className="not-prose mt-3 overflow-x-auto">
        <WorkflowDiagram graph={map.graph} instanceId={map.id} />
      </div>
      {map.evidence.length > 0 ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-text-3 hover:text-text-2">
            {map.evidence.length} quote{map.evidence.length === 1 ? "" : "s"} from the people who described it
          </summary>
          <ul className="mt-2 space-y-2 border-l border-border pl-3">
            {map.evidence.map((c) => (
              <li key={c.id}>
                <div className="text-xs font-medium text-text-2">
                  {c.contributorName} <span className="text-text-3">· {c.contributorRole}</span>
                </div>
                <p className="text-[13px] italic leading-relaxed text-text-2">&ldquo;{c.sourceQuote}&rdquo;</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </figure>
  );
}
