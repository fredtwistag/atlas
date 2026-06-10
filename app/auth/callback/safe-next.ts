/**
 * Validate a post-login `?next=` redirect target. Returns the value only when it
 * is a same-origin **relative path**, otherwise `null` so the caller falls back
 * to the role landing path. Guards against open redirects like `.evil.com/x`
 * (→ `https://origin.com.evil.com/x`) and protocol-relative `//host` / `/\host`.
 */
export function safeNext(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith("/")) return null;
  // protocol-relative: browsers treat `/\` like `//`
  if (next.startsWith("//") || next.startsWith("/\\")) return null;
  // a colon could smuggle a scheme (`/path:`) or otherwise change parsing
  if (next.includes(":")) return null;
  return next;
}
