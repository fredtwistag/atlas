import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { horizonMeta } from "@/lib/ui-maps";
import { moneyRange } from "@/lib/format";
import type { SprintPortfolio } from "@/lib/types";

/**
 * Pilot Portfolio panel (Ticket A): the curated 3-5 recommendation + its
 * narrative. A `draft` portfolio carries a note that it's pending Twistag
 * review before it goes to the sponsor (the "Twistag-curated first" decision).
 */
export function PilotPortfolio({
  portfolio,
}: {
  portfolio: SprintPortfolio | null;
}) {
  if (!portfolio || portfolio.items.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm text-text-3">
          The pilot portfolio appears here once Atlas has surfaced enough
          high-confidence opportunities to recommend a balanced 3–5 to fund.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      {portfolio.status === "draft" ? (
        <p className="mb-3 text-xs font-medium text-text-3">
          Draft — pending Twistag review before it goes to the sponsor.
        </p>
      ) : null}
      {portfolio.narrative ? (
        <p className="mb-4 text-sm leading-relaxed text-text-2">
          {portfolio.narrative}
        </p>
      ) : null}
      <ol className="space-y-3">
        {portfolio.items.map((it) => {
          const hz = horizonMeta[it.horizon];
          return (
            <li key={it.opportunityId} className="flex items-start gap-3">
              <span className="mt-0.5 font-mono text-xs font-semibold text-text-3">
                {String(it.sequenceOrder).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium leading-tight">{it.title}</span>
                  {hz ? <Badge tone={hz.tone}>{hz.label}</Badge> : null}
                  <Badge tone="success">
                    {moneyRange(it.impactLow, it.impactHigh)}/yr
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-text-3">
                  {it.inclusionRationale}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
