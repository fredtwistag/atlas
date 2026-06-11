import * as Sentry from "@sentry/nextjs";
import { sentryBaseOptions } from "@/lib/sentry-options";

/**
 * Sentry init for the Node.js server runtime. Imported from
 * `instrumentation.ts` `register()` (alongside plan 022's `validateEnv()`),
 * never standalone. See plan 023.
 *
 * NO-DSN NO-OP: `dsn` is `process.env.SENTRY_DSN` — undefined when unconfigured.
 * `Sentry.init({ dsn: undefined })` produces an inert client (no transport, no
 * network, capture* are no-ops), so local/CI and a DSN-less prod boot behave
 * identically. The DSN is optional in every tier of `lib/env.ts`, so a missing
 * DSN can never fail a deploy or a build.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  ...sentryBaseOptions,
});
