import { SENTRY_PRIVACY_OPTIONS } from "@/lib/sentry-scrub";

/**
 * Shared `Sentry.init` options used by all three runtimes (server, edge,
 * client). See plan 023.
 *
 * THE NO-OP CONTRACT (essential — see plan 023 "app must run fine without it"):
 * a Sentry DSN is OPTIONAL in every environment. With no DSN, `init` is still
 * called but Sentry stays inert (no transport, no network), and the build/dev
 * behave identically to having no Sentry at all. `lib/env.ts` keeps the DSN out
 * of the required tier so an unset DSN can never crash a boot or a `next build`.
 *
 * Sampling (plan 023, Step 1):
 *  - errors: 100% (every unhandled error captured).
 *  - traces: 10% (`tracesSampleRate: 0.1`) — performance is sampled, not full.
 *
 * Session Replay is disabled entirely (replaysSessionSampleRate: 0,
 * replaysOnErrorSampleRate: 0): replay records the DOM, which on a conversation
 * surface would capture transcript content — exactly what the privacy rule
 * forbids. We don't even load the replay integration.
 *
 * PII/content scrubbing comes from SENTRY_PRIVACY_OPTIONS (the single
 * `beforeSend` chokepoint) spread in below.
 */
export const sentryBaseOptions = {
  // 100% of errors; 10% of perf traces. Tuning is post-launch (plan 023 scope).
  tracesSampleRate: 0.1,
  // Replay records the DOM → would capture transcripts. Off, fully.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  // Quieter logs in dev; flip on via SENTRY_DEBUG if diagnosing the SDK itself.
  debug: false,
  // The single PII/content chokepoint: sendDefaultPii:false + beforeSend scrub.
  ...SENTRY_PRIVACY_OPTIONS,
} as const;
