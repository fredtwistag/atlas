import { describe, it, expect, beforeEach, vi } from "vitest";

// The sign-in server actions call Supabase via @/lib/supabase/server and read the
// client IP from next/headers. Mock both so the test exercises the REAL rate
// limiter (against embedded Postgres) while observing whether Supabase is hit.
type AuthError = { message: string; status?: number } | null;
const signInWithOtp = vi.fn<() => Promise<{ error: AuthError }>>(async () => ({
  error: null,
}));
const verifyOtp = vi.fn<() => Promise<{ error: AuthError }>>(async () => ({
  error: null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signInWithOtp, verifyOtp },
  }),
}));

let forwardedFor = "203.0.113.1";
vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) =>
      name.toLowerCase() === "x-forwarded-for" ? forwardedFor : null,
  }),
}));

import { requestSignInCode, verifySignInCode } from "./actions";
import { resetDb } from "@/db/test/helpers";

beforeEach(async () => {
  await resetDb(); // clears rate_limits
  signInWithOtp.mockClear();
  verifyOtp.mockClear();
  forwardedFor = "203.0.113.1";
});

describe("requestSignInCode — per-email throttle (3 / 10 min)", () => {
  it("sends for the first 3 and skips the 4th, all reporting success", async () => {
    const email = "pilot@example.com";
    for (let i = 0; i < 3; i++) {
      const r = await requestSignInCode(email);
      expect(r).toEqual({ ok: true, throttled: false });
    }
    expect(signInWithOtp).toHaveBeenCalledTimes(3);

    // 4th within the window: blocked. Same success shape, no Supabase call.
    const fourth = await requestSignInCode(email);
    expect(fourth).toEqual({ ok: true, throttled: true });
    expect(signInWithOtp).toHaveBeenCalledTimes(3);
  });

  it("normalizes case/whitespace so the email key is stable", async () => {
    await requestSignInCode("Pilot@Example.com ");
    await requestSignInCode("pilot@example.com");
    await requestSignInCode("  PILOT@EXAMPLE.COM");
    expect(signInWithOtp).toHaveBeenCalledTimes(3);
    const blocked = await requestSignInCode("pilot@example.com");
    expect(blocked.throttled).toBe(true);
    expect(signInWithOtp).toHaveBeenCalledTimes(3);
  });
});

describe("requestSignInCode — per-IP throttle (10 / 10 min)", () => {
  it("blocks the 11th send from one IP across different emails", async () => {
    // 10 distinct emails (so per-email never trips) from the same IP.
    for (let i = 0; i < 10; i++) {
      const r = await requestSignInCode(`user${i}@example.com`);
      expect(r.throttled).toBe(false);
    }
    expect(signInWithOtp).toHaveBeenCalledTimes(10);

    const eleventh = await requestSignInCode("user10@example.com");
    expect(eleventh).toEqual({ ok: true, throttled: true });
    expect(signInWithOtp).toHaveBeenCalledTimes(10);
  });
});

describe("verifySignInCode — OTP throttle (5 / 15 min)", () => {
  it("short-circuits the 6th attempt before calling Supabase, with honest copy", async () => {
    const email = "verify@example.com";
    // Make Supabase reject so each attempt is a "wrong code" (still consumes).
    verifyOtp.mockResolvedValue({
      error: { message: "Token has expired or is invalid", status: 403 },
    });

    for (let i = 0; i < 5; i++) {
      const r = await verifySignInCode(email, "000000");
      expect(r.ok).toBe(false);
    }
    expect(verifyOtp).toHaveBeenCalledTimes(5);

    const sixth = await verifySignInCode(email, "000000");
    expect(sixth).toEqual({
      ok: false,
      error: "Too many attempts. Request a new code in a few minutes.",
    });
    // Crucially: no Supabase call on the blocked attempt.
    expect(verifyOtp).toHaveBeenCalledTimes(5);
  });

  it("returns ok on a valid code within the limit", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const r = await verifySignInCode("ok@example.com", "123456");
    expect(r).toEqual({ ok: true });
    expect(verifyOtp).toHaveBeenCalledTimes(1);
  });
});

describe("requestSignInCode — no enumeration", () => {
  it("treats a no-account error as success (same shape, no leak)", async () => {
    signInWithOtp.mockResolvedValueOnce({
      error: { message: "Signups not allowed for otp", status: 422 },
    });
    const r = await requestSignInCode("ghost@example.com");
    expect(r).toEqual({ ok: true, throttled: false });
  });

  it("rethrows a genuine transport error (not account existence)", async () => {
    signInWithOtp.mockResolvedValueOnce({
      error: { message: "Service unavailable", status: 503 },
    });
    await expect(requestSignInCode("real@example.com")).rejects.toThrow(
      /Service unavailable/,
    );
  });
});
