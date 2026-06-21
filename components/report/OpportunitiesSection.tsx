import { OpportunityCard } from "@/components/opportunity/OpportunityCard";
import { WorkflowDiagram } from "@/components/workflow/WorkflowDiagram";
import { RankedOpportunityTable } from "./RankedOpportunityTable";
import type { Opportunity } from "@/lib/types";
import type { Currency } from "@/lib/format";
import type { WorkflowMapView } from "@/services/synthesis/workflows/types";

/** Opportunities: matrix overview → top-3 elevated cards → compact ranked table. */
export function OpportunitiesSection({
  opps,
  maps,
  currency,
  href,
}: {
  opps: Opportunity[];
  maps: WorkflowMapView[];
  currency: Currency;
  href?: (id: string) => string;
}) {
  const matrix = maps.find((m) => m.kind === "impact_effort");
  const top = opps.slice(0, 3);
  const rest = opps.slice(3);

  return (
    <section className="mb-10">
      <h2 className="mb-2 text-2xl font-semibold tracking-tight">Opportunities</h2>
      {opps.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-text-3">
          No opportunities surfaced yet. They appear here as Atlas extracts and scores captures from completed sessions.
        </p>
      ) : (
        <>
          <p className="mb-4 text-md leading-relaxed text-text-2">
            {opps.length} surfaced, ranked by composite score. The top three are the place to start.
          </p>
          {matrix ? (
            <figure className="not-prose mb-6 rounded-lg border border-border bg-surface p-4">
              <figcaption className="mb-2 text-sm font-medium text-text">Impact vs. effort</figcaption>
              <WorkflowDiagram graph={matrix.graph} instanceId={matrix.id} />
              <ol className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-text-2">
                {matrix.graph.steps.map((s, i) => (
                  <li key={s.id}>{i + 1}. {s.label}</li>
                ))}
              </ol>
            </figure>
          ) : null}
          <div className="not-prose space-y-3">
            {top.map((o, i) => (
              <OpportunityCard key={o.id} opp={o} href={href?.(o.id)} rank={i + 1} meta="category" currency={currency} />
            ))}
          </div>
          {rest.length > 0 ? (
            <div className="not-prose mt-4">
              <RankedOpportunityTable opps={rest} currency={currency} startRank={top.length + 1} href={href} />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
