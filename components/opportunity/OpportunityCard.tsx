import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ScoreBadge } from "@/components/ScoreBadge";
import { usdRange } from "@/lib/data";
import type { Opportunity } from "@/lib/types";

export function OpportunityCard({
  opp,
  href,
  rank,
  /** Third badge: corroborating voices (dashboard) or the category (report). */
  meta = "voices",
}: {
  opp: Opportunity;
  href: string;
  rank?: number;
  meta?: "voices" | "category";
}) {
  return (
    <Link href={href}>
      <Card className="group p-4 transition-all hover:border-border-strong hover:shadow">
        <div className="flex items-start gap-3">
          <ScoreBadge score={opp.compositeScore} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-md font-semibold leading-snug">
                {rank != null ? (
                  <span className="mr-1.5 text-xs font-semibold text-text-3">
                    {String(rank).padStart(2, "0")}
                  </span>
                ) : null}
                {opp.title}
              </h3>
              <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-text-3 transition-colors group-hover:text-brand" />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone="success">
                {usdRange(opp.impactLow, opp.impactHigh)}/yr
              </Badge>
              <Badge tone="outline">
                {opp.timeToShipWeeksLow}–{opp.timeToShipWeeksHigh} wks
              </Badge>
              <Badge tone="neutral">
                {meta === "category"
                  ? opp.category
                  : `${opp.contributorCount} voices`}
              </Badge>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
