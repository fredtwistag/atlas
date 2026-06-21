import { InsightCard } from "./InsightCard";
import type { WorkflowMapView } from "@/services/synthesis/workflows/types";

const FINDING_KINDS = new Set(["swimlane", "systems_topology"]);

/**
 * "What we found" — workflow maps promoted to insight cards. The impact/effort
 * matrix is excluded here; it leads the Opportunities section instead.
 */
export function FindingsSection({ maps }: { maps: WorkflowMapView[] }) {
  const findings = maps.filter((m) => FINDING_KINDS.has(m.kind));
  if (findings.length === 0) return null;
  return (
    <section className="mb-10">
      <h2 className="mb-2 text-2xl font-semibold tracking-tight">What we found</h2>
      <p className="mb-4 text-md leading-relaxed text-text-2">
        Synthesized from what contributors described — every step traces to its captures. Steps Atlas inferred to connect the flow are dashed.
      </p>
      <div className="not-prose space-y-5">
        {findings.map((m) => (
          <InsightCard key={m.id} map={m} />
        ))}
      </div>
    </section>
  );
}
