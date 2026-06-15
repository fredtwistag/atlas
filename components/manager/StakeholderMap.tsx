import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { stakeholderTypeMeta } from "@/lib/ui-maps";
import type { StakeholderEntry } from "@/lib/types";

/**
 * Stakeholder map (Ticket B): who approves, who can block, and who has to adopt
 * — by role. Role labels only, never individual names.
 */
export function StakeholderMap({ items }: { items: StakeholderEntry[] }) {
  if (items.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm text-text-3">
          The stakeholder map appears here as decision gates and handoffs come
          up in sessions — who signs off, who can block, and who has to adopt
          the change.
        </p>
      </Card>
    );
  }

  return (
    <Card className="divide-y divide-border">
      {items.map((s) => {
        const meta = stakeholderTypeMeta[s.type];
        return (
          <div key={s.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium leading-tight">{s.roleLabel}</span>
              {s.department ? (
                <span className="text-xs text-text-3">{s.department}</span>
              ) : null}
              <Badge tone={meta.tone}>{meta.label}</Badge>
              {s.gatedOpportunityIds.length > 0 ? (
                <span className="text-xs text-text-3">
                  gates {s.gatedOpportunityIds.length}{" "}
                  {s.gatedOpportunityIds.length === 1
                    ? "opportunity"
                    : "opportunities"}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-text-3">{s.summary}</p>
          </div>
        );
      })}
    </Card>
  );
}
