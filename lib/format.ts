/**
 * Compact USD formatters for impact figures. Pure and server-safe — no mock
 * data dependency. Use these in shipped routes instead of importing from
 * lib/data (demo fixtures).
 */
export function usdShort(n: number): string {
  if (n >= 1_000_000)
    return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

export function usdRange(low: number, high: number): string {
  return `${usdShort(low)}–${usdShort(high)}`;
}
