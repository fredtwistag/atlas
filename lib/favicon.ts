/**
 * Build a favicon URL for an org's website domain via a third-party favicon
 * service (Google s2). Accepts a bare domain ("vizta.com") or a full URL
 * ("https://vizta.pt/about") and normalizes to the hostname. Returns null when
 * there's no usable domain so callers can fall back to initials.
 */
export function faviconUrl(
  domain: string | null | undefined,
  size = 64,
): string | null {
  if (!domain || !domain.trim()) return null;
  let host: string;
  try {
    host = new URL(
      domain.startsWith("http") ? domain : `https://${domain}`,
    ).hostname;
  } catch {
    return null;
  }
  if (!host) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`;
}
