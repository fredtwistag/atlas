import { validateEnv, isNextBuildPhase } from "@/lib/env";

/**
 * Next.js calls `register()` once per server runtime start (Node.js + Edge),
 * before the first request is served. We use it as the earliest "every prod
 * boot runs this" hook to fail loud on a misconfigured production environment —
 * the silent failures plan 022 is about (no RESEND_API_KEY → no invites, etc.).
 *
 * Why HERE and not next.config.mjs / build time:
 *  - `next build` runs with NODE_ENV=production but WITHOUT the prod-only
 *    secrets that only live in Vercel. Validating at build time would break the
 *    shared `npm run verify` gate (and CI) for every other plan.
 *  - So we guard twice: skip during the build phase, and skip outside
 *    production. validateEnv() then only ever runs on a real production server
 *    boot, where the secrets must exist.
 *
 * The Edge runtime also invokes register(); we only validate on the Node.js
 * runtime (process.env is fully present there) and leave Edge alone.
 */
export function register(): void {
  // Never validate while `next build` is collecting the production build.
  if (isNextBuildPhase()) return;
  // Only enforce on a real production server boot.
  if (process.env.NODE_ENV !== "production") return;
  // Edge runtime has a partial env surface; validate on Node.js only.
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;

  // Throws ONE error naming every missing/invalid key (never values). A failed
  // boot here is intentional: better a loud crash than silent no-ops in prod.
  validateEnv();
}
