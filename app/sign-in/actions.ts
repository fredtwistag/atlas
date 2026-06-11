"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consume } from "@/lib/rate-limit";
import { appUrl } from "@/lib/app-url";

/**
 * Rate-limit windows for the sign-in surface. Deliberately generous — a too-tight
 * limit locks out a legitimate pilot user (plan 019). Email send is double-keyed
 * (per-email AND per-IP) so one address can't be bombed and one IP can't fan out.
 */
const SIGNIN_EMAIL_LIMIT = { limit: 3, windowSeconds: 600 }; // 3 / 10 min per email
const SIGNIN_IP_LIMIT = { limit: 10, windowSeconds: 600 }; // 10 / 10 min per IP
const OTP_VERIFY_LIMIT = { limit: 5, windowSeconds: 900 }; // 5 / 15 min per email

/**
 * `shouldCreateUser: false` plus treating the "no account" error as success keeps
 * the response identical whether or not the email has an Atlas account — no
 * enumeration. Supabase surfaces "signups not allowed" (422 / otp_disabled) when
 * the user doesn't exist. (Mirrors the original client-side guard, moved server-side
 * so the rate limiter can sit in front of the send.)
 */
function isNoAccountError(error: {
  message: string;
  status?: number;
}): boolean {
  return (
    error.status === 422 ||
    /not allowed|signups?|otp_disabled|not found/i.test(error.message)
  );
}

/** The caller's IP — Vercel sets `x-forwarded-for`; we take the first hop. */
async function clientIp(): Promise<string> {
  const xff = (await headers()).get("x-forwarded-for");
  return xff?.split(",")[0]?.trim() || "unknown";
}

export type RequestCodeResult = { ok: true; throttled: boolean };
export type VerifyCodeResult = { ok: true } | { ok: false; error: string };

/**
 * Send a sign-in code/link, rate-limited and non-enumerating.
 *
 * On throttle we return the SAME success shape and skip the send entirely, so a
 * blocked request is indistinguishable from a real one (the UI shows the calm
 * "check your email" state with a soft "wait a few minutes" note). The per-email
 * and per-IP limits are both consumed; either tripping marks the request throttled.
 */
export async function requestSignInCode(
  email: string,
): Promise<RequestCodeResult> {
  const normalized = email.trim().toLowerCase();

  const [perEmail, perIp] = await Promise.all([
    consume(`signin-email:${normalized}`, SIGNIN_EMAIL_LIMIT),
    consume(`signin-email-ip:${await clientIp()}`, SIGNIN_IP_LIMIT),
  ]);
  if (!perEmail.allowed || !perIp.allowed) {
    // Blocked: skip the send, but report success so there's no enumeration or
    // throttle-timing signal an attacker could use.
    return { ok: true, throttled: true };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${appUrl()}/auth/callback`,
    },
  });
  if (error && !isNoAccountError(error)) {
    // A real send/transport failure. Surfacing it doesn't leak account existence
    // (no-account is folded into success above), and it's actionable for the user.
    throw new Error(error.message);
  }
  return { ok: true, throttled: false };
}

/**
 * Verify a 6-digit code, rate-limited per email. Over the limit we short-circuit
 * BEFORE calling Supabase (so the limited 6-digit space can't be brute-forced) and
 * return honest copy telling the user what happened and what to do.
 */
export async function verifySignInCode(
  email: string,
  code: string,
): Promise<VerifyCodeResult> {
  const normalized = email.trim().toLowerCase();

  const limit = await consume(`otp-verify:${normalized}`, OTP_VERIFY_LIMIT);
  if (!limit.allowed) {
    return {
      ok: false,
      error: "Too many attempts. Request a new code in a few minutes.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: normalized,
    token: code.trim(),
    type: "email",
  });
  if (error) {
    return {
      ok: false,
      error: "That code didn't work. Check it, or use the link in your email.",
    };
  }
  return { ok: true };
}

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
