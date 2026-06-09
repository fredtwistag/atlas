import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "../lib/supabase/admin";
import { decodeJwtPayload, parseClaims } from "../lib/auth-claims";

/**
 * Proves the access-token hook end-to-end against the real project: generate a
 * magic link, verify it to mint a session, decode the token, print the claims.
 * If claims are null, the hook isn't enabled in the Supabase dashboard yet.
 */
async function check(email: string): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data.properties?.hashed_token) {
    throw new Error(error?.message ?? "generateLink failed");
  }

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: verified, error: vErr } = await anon.auth.verifyOtp({
    type: "email",
    token_hash: data.properties.hashed_token,
  });
  if (vErr || !verified.session) {
    throw new Error(vErr?.message ?? "verifyOtp failed");
  }

  const claims = parseClaims(decodeJwtPayload(verified.session.access_token));
  // eslint-disable-next-line no-console
  console.log(`${email}:`, claims ?? "(no Atlas claims — enable the hook)");
}

async function main(): Promise<void> {
  await check("admin@twistag.com");
  await check("marcus@northwind.example");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
