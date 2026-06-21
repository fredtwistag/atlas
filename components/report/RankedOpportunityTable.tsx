import Link from "next/link";
import { moneyShort, type Currency } from "@/lib/format";
import type { Opportunity } from "@/lib/types";

/** Compact ranked list for the opportunities below the elevated top three. */
export function RankedOpportunityTable({
  opps,
  currency,
  startRank,
  href,
}: {
  opps: Opportunity[];
  currency: Currency;
  startRank: number;
  href?: (id: string) => string;
}) {
  if (opps.length === 0) return null;
  return (
    <table className="not-prose w-full border-collapse">
      <tbody>
        {opps.map((o, i) => (
          <tr key={o.id} className="border-b border-border last:border-0">
            <td className="py-2.5 pr-3 align-top font-mono text-sm tabular-nums text-text-3">
              {startRank + i}
            </td>
            <td className="py-2.5 pr-3 align-top">
              {href ? (
                <Link href={href(o.id)} className="text-sm font-medium hover:text-brand hover:underline">
                  {o.title}
                </Link>
              ) : (
                <span className="text-sm font-medium">{o.title}</span>
              )}
              <div className="text-xs text-text-3">{o.category}</div>
            </td>
            <td className="whitespace-nowrap py-2.5 text-right align-top text-sm text-success">
              {moneyShort(o.impactLow, currency)}–{moneyShort(o.impactHigh, currency)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
