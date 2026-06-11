import * as Sentry from "@sentry/nextjs";
import { sentryBaseOptions } from "@/lib/sentry-options";

/**
 * Sentry init for the Edge runtime (middleware, edge routes). Imported from
 * `instrumentation.ts` `register()` when `NEXT_RUNTIME === "edge"`. See plan 023.
 *
 * Same no-DSN no-op contract as the server config: `dsn` undefined → inert
 * client. The DSN is optional in every env tier, so it can never break a boot.
 *
 * Note: plan 022's `validateEnv()` deliberately runs on the Node.js runtime
 * ONLY (Edge has a partial env surface). Sentry, by contrast, DOES init on Edge
 * so edge-runtime errors are still captured — the two concerns are independent.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  ...sentryBaseOptions,
});
