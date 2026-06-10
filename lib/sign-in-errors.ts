/**
 * Maps a `?error=` code on /sign-in to user-facing copy. The callback and claims
 * gate redirect here with `auth` (expired/used link) or `no-access` (email isn't
 * in any workspace). Returns null for no/unknown code — show the plain form.
 */
export function signInErrorMessage(
  code: string | null | undefined,
): string | null {
  switch (code) {
    case "auth":
      return "That sign-in link expired or was already used. Enter your email for a fresh one.";
    case "no-access":
      return "That email isn't part of an Atlas workspace yet. Ask the person who invited you to resend your invite.";
    default:
      return null;
  }
}
