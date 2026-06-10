import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/app-url";

/**
 * Generate a one-time magic-link token for `email` and wrap it in an Atlas
 * `/auth/confirm` URL. The confirm page's button POSTs the verification, so
 * corporate mail prefetchers (Outlook SafeLinks et al.) — which only ever GET —
 * can't silently consume the one-time token. Server-only (uses the service-role
 * admin client). Throws if Supabase can't mint the link.
 *
 * Proven mechanism: the dev sign-in (sign-in/actions.ts) generates the same
 * magiclink token and verifies it with verifyOtp({ type: "email", token_hash }).
 */
export async function generateInviteLink(email: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data.properties?.hashed_token) {
    throw new Error(error?.message ?? "could not generate invite link");
  }
  const params = new URLSearchParams({
    token_hash: data.properties.hashed_token,
  });
  return `${appUrl()}/auth/confirm?${params.toString()}`;
}
