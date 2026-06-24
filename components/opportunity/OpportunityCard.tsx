import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ScoreBadge } from "@/components/ScoreBadge";
import { moneyRange, type Currency } from "@/lib/format";
import { horizonMeta, deliveryMeta } from "@/lib/ui-maps";
import { cn } from "@/lib/cn";
import type { Opportunity } from "@/lib/types";

/**
 * Opportunity summary card. With `href` it's a clickable link (dashboard,
 * manager report). Without `href` it renders as a plain, non-interactive card —
 * used by the Twistag read-only report where there's no drill-down.
 */
export function OpportunityCard({
  opp,
  href,
  rank,
  /** Third badge: corroborating voices (dashboard) or the category (report). */
  meta = "voices",
  currency = "EUR",
}: {
  opp: Opportunity;
  href?: string;
  rank?: number;
  meta?: "voices" | "category";
  currency?: Currency;
}) {
  const body = (
    <Card
      className={cn(
        "p-4",
        href && "group transition-all hover:border-border-strong hover:shadow",
      )}
    >
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
            {href ? (
              <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-text-3 transition-colors group-hover:text-brand" />
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone="success">
              {moneyRange(opp.impactLow, opp.impactHigh, currency)}/yr
            </Badge>
            <Badge tone="outline">
              {opp.timeToShipWeeksLow}–{opp.timeToShipWeeksHigh} wks
            </Badge>
          </div>
          <p className="mt-1.5 text-xs text-text-3">
            {meta === "category"
              ? `${opp.category} · corroborated by ${opp.contributorCount} ${opp.contributorCount === 1 ? "voice" : "voices"}`
              : `${opp.contributorCount} voices`}
            {horizonMeta[opp.horizon] ? ` · ${horizonMeta[opp.horizon]!.label}` : ""}
            {deliveryMeta[opp.delivery] ? ` · ${deliveryMeta[opp.delivery]!.label}` : ""}
          </p>
        </div>
      </div>
    </Card>
  );

  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
