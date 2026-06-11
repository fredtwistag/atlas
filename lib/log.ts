/**
 * Minimal structured logger. See plan 023.
 *
 * One job: emit a single line of JSON per event so logs are greppable and
 * machine-parseable, and so the privacy rule is mechanical rather than a matter
 * of remembering to be careful at each call site.
 *
 * THE CONVENTION (enforced by the type, reinforced by `lib/log.test.ts`):
 *  - `event` is a short, stable, content-free slug ("email.send.skipped",
 *    "llm.complete.failed"). NEVER interpolate user input into it.
 *  - `fields` carry IDs and counts ONLY — `tenantId`, `sessionId`, `userId`,
 *    `count`, `area`, `status`. They are typed `string | number | boolean`, so
 *    you physically cannot attach an object, an Error, or an array.
 *
 * What MUST NOT appear in `event` or `fields`, ever (CLAUDE.md "Privacy by
 * design"): conversation transcript text, capture `summary`/`sourceQuote`,
 * email addresses, IC names, or any free-form user content. An ID is fine
 * (it is not PII in our model); the thing the ID points at is not. When you
 * want to log "what happened", log the count and the IDs, not the payload.
 *
 * This is deliberately tiny — no transport, no levels config, no async. It
 * writes to the matching `console` method (the ONLY sanctioned `console` use in
 * the app) so Vercel's log drain picks it up. Sentry is the separate channel for
 * actual error events (services attach captures there); this is the breadcrumb
 * trail in plain logs.
 */

export type LogFields = Record<string, string | number | boolean>;

type Level = "info" | "warn" | "error";

function emit(level: Level, event: string, fields: LogFields): void {
  // One line of JSON. `level` and `event` first so a human scanning the raw
  // stream reads them before the fields.
  const line = JSON.stringify({ level, event, ...fields });
  // eslint-disable-next-line no-console -- lib/log is the single sanctioned console sink; everything else routes through here.
  console[level](line);
}

export const log = {
  /** Routine, expected events (a skipped no-op, a job that found nothing to do). */
  info(event: string, fields: LogFields = {}): void {
    emit("info", event, fields);
  },
  /** Something degraded but handled (extraction produced nothing, a retry fired). */
  warn(event: string, fields: LogFields = {}): void {
    emit("warn", event, fields);
  },
  /** A failure worth attention. Pair with a Sentry capture at real error sites. */
  error(event: string, fields: LogFields = {}): void {
    emit("error", event, fields);
  },
} as const;
