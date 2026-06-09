"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Dev-only one-click sign-in: generate a magic link for the persona and verify it
 * server-side to establish the session — no email round-trip. 404/throws in prod.
 */
export async function devSignIn(formData: FormData): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("dev sign-in is disabled in production");
  }
  const email = String(formData.get("email") ?? "");
  const next = String(formData.get("next") ?? "/me");

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data.properties?.hashed_token) {
    throw new Error(error?.message ?? "could not generate sign-in link");
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: data.properties.hashed_token,
  });
  if (verifyError) throw new Error(verifyError.message);

  redirect(next);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
