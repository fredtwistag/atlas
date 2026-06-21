/**
 * Compact money formatters for impact figures. Pure and server-safe — no mock
 * data dependency. Defaults to EUR (Wave-1 pilots are EUR); pass `currency` to
 * override. Per-tenant currency is a post-demo follow-up.
 */
export type Currency = "EUR" | "USD" | "GBP";

const SYMBOL: Record<Currency, string> = { EUR: "€", USD: "$", GBP: "£" };

export function moneyShort(n: number, currency: Currency = "EUR"): string {
  const s = SYMBOL[currency];
  if (n >= 1_000_000)
    return `${s}${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${s}${Math.round(n / 1_000)}K`;
  return `${s}${n}`;
}

export function moneyRange(
  low: number,
  high: number,
  currency: Currency = "EUR",
): string {
  return `${moneyShort(low, currency)}–${moneyShort(high, currency)}`;
}
