import * as Sentry from "@sentry/nextjs";

/**
 * The app's seam over Sentry. See plan 023, Step 3.
 *
 * Services (LLM, email, jobs) call `captureFailure` instead of importing the
 * Sentry SDK directly. Two reasons:
 *  1. Tagging convention in ONE place. Every captured failure carries an
 *     `area: "llm" | "email" | "jobs"` tag and, when known, a `tenantId` tag
 *     (an ID is not PII in our model; names/emails are — those never go on).
 *  2. The no-op guarantee. With no DSN configured, `Sentry.init` was never
 *     called, so `captureException` is itself a no-op — but we ALSO log a
 *     structured `*.failed` line through `lib/log`, so a failure is always
 *     visible in plain logs whether or not Sentry is wired. The build and dev
 *     run identically with or without a DSN.
 *
 * IMPORTANT — what we pass to Sentry: the Error and a tiny scalar tag set ONLY.
 * Never the conversation message, the capture quote, the email body, or a name.
 * `lib/sentry-scrub.ts` is the backstop that strips content even if a future
 * call site slips, but the discipline is: pass IDs and counts, never content.
 */

export type FailureArea = "llm" | "email" | "jobs";

export type CaptureContext = {
  /** The functional area — becomes the `area` tag. */
  area: FailureArea;
  /** Tenant the failure happened under, if known. NOT PII; helps locate it. */
  tenantId?: string;
  /** Session/job correlation id, if known. NOT PII. */
  sessionId?: string;
  /**
   * Extra scalar tags — IDs/counts/flags ONLY. The type forbids objects, and
   * `sentry-scrub` redacts content-keyed values as a backstop, but the contract
   * is: nothing here is user content.
   */
  tags?: Record<string, string | number | boolean>;
};

/**
 * Send a failure to Sentry with our standard tags. A no-op (beyond the tag
 * marshalling) when Sentry has no DSN, because `captureException` does nothing
 * until `init` ran with a DSN. Callers should ALSO `log.error(...)` so the
 * failure shows in plain logs regardless of Sentry config.
 */
export function captureFailure(error: unknown, ctx: CaptureContext): void {
  Sentry.withScope((scope) => {
    scope.setTag("area", ctx.area);
    if (ctx.tenantId) scope.setTag("tenantId", ctx.tenantId);
    if (ctx.sessionId) scope.setTag("sessionId", ctx.sessionId);
    if (ctx.tags) {
      for (const [k, v] of Object.entries(ctx.tags)) scope.setTag(k, v);
    }
    Sentry.captureException(error);
  });
}
