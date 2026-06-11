import * as Sentry from "@sentry/nextjs";
import { validateEnv, isNextBuildPhase } from "@/lib/env";

/**
 * Next.js calls `register()` once per server runtime start (Node.js + Edge),
 * before the first request is served. This file does TWO independent things:
 *
 *  1. (plan 022) Fail loud on a misconfigured PRODUCTION env via `validateEnv()`
 *     — the silent failures plan 022 is about (no RESEND_API_KEY → no invites).
 *  2. (plan 023) Initialise Sentry for the active server/edge runtime by
 *     importing its config (`sentry.server.config` / `sentry.edge.config`),
 *     which call `Sentry.init`. With no DSN that init is inert, so this is safe
 *     in dev, CI, and a DSN-less prod boot.
 *
 * Why validateEnv runs HERE and not in next.config.mjs / at build time:
 *  - `next build` runs with NODE_ENV=production but WITHOUT the prod-only
 *    secrets that only live in Vercel. Validating at build time would break the
 *    shared `npm run verify` gate (and CI) for every other plan.
 *  - So we guard twice: skip during the build phase, and skip outside
 *    production. validateEnv() then only ever runs on a real production server
 *    boot, where the secrets must exist.
 *
 * Edge note: register() runs on Node.js AND Edge. We validate env on Node.js
 * only (process.env is fully present there). Sentry, however, inits on BOTH so
 * edge-runtime errors are captured — the two concerns are independent.
 */
export async function register(): Promise<void> {
  // (plan 023) Sentry init for whichever runtime this is. Awaited dynamic import
  // so the edge bundle never pulls in the Node.js config and vice-versa. A no-op
  // when SENTRY_DSN is unset (the config inits an inert client). Runs in every
  // environment — Sentry being inert without a DSN makes that harmless.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  } else if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }

  // (plan 022) Production env validation — UNCHANGED. Never validate while
  // `next build` is collecting the production build.
  if (isNextBuildPhase()) return;
  // Only enforce on a real production server boot.
  if (process.env.NODE_ENV !== "production") return;
  // Edge runtime has a partial env surface; validate on Node.js only.
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;

  // Throws ONE error naming every missing/invalid key (never values). A failed
  // boot here is intentional: better a loud crash than silent no-ops in prod.
  validateEnv();
}

/**
 * (plan 023) Capture errors thrown in nested React Server Components / route
 * handlers that Next surfaces through this hook. Sentry's scrubber strips any
 * request body / PII before send; a no-op without a DSN.
 */
export const onRequestError = Sentry.captureRequestError;
