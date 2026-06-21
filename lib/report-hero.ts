import { moneyShort, type Currency } from "@/lib/format";

/**
 * The report's lead headline — the recoverable money framed as the insight.
 * Data-derived (no LLM). Honest empty state when nothing is scored yet.
 */
export function reportHeadline(opts: {
  tenantName: string;
  totalLow: number;
  totalHigh: number;
  currency: Currency;
}): string {
  if (opts.totalHigh <= 0) {
    return `Discovery is underway at ${opts.tenantName} — opportunities appear here as sessions complete.`;
  }
  const range = `${moneyShort(opts.totalLow, opts.currency)}–${moneyShort(opts.totalHigh, opts.currency)}`;
  return `${range}/yr is recoverable in how ${opts.tenantName} works today.`;
}
