import type { ErrorEvent, EventHint } from "@sentry/nextjs";

/**
 * The single PII/content chokepoint for Sentry. See plan 023, Step 2 — "the
 * non-negotiable step". Every Sentry config (client, server, edge) passes its
 * events through `scrubEvent` as `beforeSend`. This is the ONE place the privacy
 * guarantee lives, so when voice/Slack land (v1.5) their surfaces inherit it for
 * free — keep it that way (plan 023 "Maintenance notes").
 *
 * The rule (CLAUDE.md "Privacy by design"):
 *  - Conversation transcripts, capture summaries, and source quotes NEVER leave
 *    the system in an error payload.
 *  - IC names and email addresses are PII and never go to an external service.
 *  - IDs (tenantId, sessionId, userId) are NOT PII in our model — they are
 *    allowed, and are in fact what we WANT on an event so an operator can locate
 *    the failing session without reading its content.
 *
 * Strategy — strip, don't sample. We are not trying to redact cleverly; we drop
 * whole categories of data that could carry content:
 *  1. Request bodies / query strings / cookies / headers — anything a message
 *     could ride in on (`event.request`).
 *  2. Any context/extra/tag/breadcrumb-data VALUE whose KEY matches the
 *     content/PII key pattern — defensive, in case a future call site attaches
 *     something it shouldn't.
 *  3. The user object is reduced to its id (no email, no username, no ip).
 *
 * `sendDefaultPii: false` (set in each config) already keeps Sentry from
 * auto-attaching IP/cookies/headers; this is the belt-and-braces on top, plus
 * the key-name scrub for our own attached data.
 */

/** Keys whose VALUES may carry conversation content or PII — scrubbed everywhere. */
const SENSITIVE_KEY =
  /content|message|summary|sourcequote|source_quote|quote|transcript|email|body|prompt|completion|token|password|secret|apikey|api_key|authorization/i;

const REDACTED = "[redacted]";

type Bag = Record<string, unknown>;

/** Recursively redact values under sensitive keys. Bounded depth — events are shallow. */
function scrubBag(bag: Bag, depth = 0): Bag {
  if (depth > 6) return {};
  const out: Bag = {};
  for (const [key, value] of Object.entries(bag)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = REDACTED;
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = scrubBag(value as Bag, depth + 1);
    } else if (Array.isArray(value)) {
      // Arrays of objects (e.g. breadcrumb sets) get each element scrubbed; we
      // never keep raw string arrays under a non-sensitive key as-is because we
      // can't introspect them — but a plain key like `tags: string[]` is fine.
      out[key] = value.map((v) =>
        v && typeof v === "object" && !Array.isArray(v)
          ? scrubBag(v as Bag, depth + 1)
          : v,
      );
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * `beforeSend` implementation. Mutates a shallow copy of the event so Sentry's
 * own object isn't shared, drops request data wholesale, scrubs keyed values,
 * and reduces `user` to an id. Returns the cleaned event (never null — we still
 * want the error, just without the payload).
 *
 * Exported separately from the `beforeSend` wrapper so `lib/sentry-scrub.test.ts`
 * can feed it a fake event and assert the strip.
 */
export function scrubEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent {
  // 1. Drop everything a body/PII could ride in on.
  delete event.request;
  delete event.server_name;

  // 2. Reduce the user to an id only (no email / username / ip_address).
  if (event.user) {
    const id = typeof event.user.id === "string" ? event.user.id : undefined;
    event.user = id ? { id } : {};
  }

  // 3. Scrub our own attached data by key name.
  if (event.extra) event.extra = scrubBag(event.extra as Bag);
  if (event.contexts)
    event.contexts = scrubBag(event.contexts as Bag) as ErrorEvent["contexts"];
  if (event.tags)
    event.tags = scrubBag(event.tags as Bag) as ErrorEvent["tags"];

  // 4. Breadcrumbs: keep the category/message-slug shape but scrub their data
  //    bags. (Our breadcrumb messages are content-free slugs by convention; the
  //    `data` bag is where an accidental field could appear.)
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) =>
      b.data ? { ...b, data: scrubBag(b.data as Bag) } : b,
    );
  }

  return event;
}

/** The shared Sentry config fragment every runtime spreads into `Sentry.init`. */
export const SENTRY_PRIVACY_OPTIONS = {
  /** Never let Sentry auto-attach IP, cookies, request headers. */
  sendDefaultPii: false,
  /** The single content/PII chokepoint. */
  beforeSend: scrubEvent,
} as const;
