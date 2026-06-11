import * as Sentry from "@sentry/nextjs";
import { sentryBaseOptions } from "@/lib/sentry-options";

/**
 * Sentry init for the BROWSER. Next 15 / Sentry v10 load this file on the client
 * automatically (the successor to `sentry.client.config.ts`). See plan 023.
 *
 * NO-DSN NO-OP: `dsn` is `process.env.NEXT_PUBLIC_SENTRY_DSN` — undefined when
 * unconfigured, which makes the client inert (no network, capture* no-ops). The
 * marketing pages therefore ship Sentry as effectively dead weight only when a
 * DSN is set; with none set it never initializes. (Plan 023 STOP condition on
 * marketing-page bundle size: Session Replay — the heavy integration — is
 * disabled in `sentryBaseOptions`, so the client stays lean.)
 *
 * Privacy: the SAME `beforeSend` scrubber as server/edge runs here (via
 * `sentryBaseOptions`), so a client-side error never ships request bodies, the
 * user's email, or any DOM-captured content. Session Replay is off precisely
 * because it would record transcript text.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  ...sentryBaseOptions,
});

/**
 * Required by Sentry's Next.js client SDK so navigation spans are instrumented.
 * Safe no-op when there's no DSN.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
