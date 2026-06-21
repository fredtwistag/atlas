import Link from "next/link";
import { moneyShort, type Currency } from "@/lib/format";
import type { Opportunity } from "@/lib/types";

/**
 * Slim sticky bar keeping the recommended move + CTA visible on scroll.
 * Slice-1 stand-in; Slice 2 migrates this into the drill-down sidebar.
 */
export function StickyDecisionBar({
  opps,
  currency,
  opportunityHref,
  isSponsor = false,
}: {
  opps: Opportunity[];
  currency: Currency;
  opportunityHref?: (id: string) => string;
  isSponsor?: boolean;
}) {
  const top = opps[0];
  if (!top || !opportunityHref) return null;
  const totalLow = opps.slice(0, 5).reduce((s, o) => s + o.impactLow, 0);
  return (
    <div
      data-print-hide
      className="sticky top-0 z-30 -mx-6 mb-6 flex items-center justify-between gap-3 border-b border-border bg-bg/85 px-6 py-2.5 backdrop-blur"
    >
      <div className="min-w-0 text-sm">
        <span className="font-semibold">{moneyShort(totalLow, currency)}+/yr</span>{" "}
        <span className="text-text-3">· start with</span>{" "}
        <span className="truncate font-medium">{top.title}</span>
      </div>
      <Link
        href={opportunityHref(top.id)}
        className="shrink-0 rounded-md bg-brand px-3.5 py-1.5 text-sm font-medium text-white hover:bg-brand-hover"
      >
        {isSponsor ? "Approve →" : "Review →"}
      </Link>
    </div>
  );
}
