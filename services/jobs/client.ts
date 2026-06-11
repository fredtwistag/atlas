import { EventSchemas, Inngest } from "inngest";

/**
 * The Atlas Inngest client (plan 020). One app, one client, one typed event map.
 *
 * Background work runs here — NOT in tRPC procedures — for two reasons:
 *  1. CLAUDE.md's RLS rule: "Service-role bypass allowed only inside Inngest
 *     workers + audit-logged." The nudge/invite/digest sends were the last
 *     `withServiceRole` email paths in tRPC; moving them here makes that rule
 *     true. Worker context IS the sanctioned place for service-role + audit.
 *  2. Retries + visibility. A failed invite or digest send retries and shows in
 *     the Inngest dashboard instead of vanishing in a `Promise.allSettled`.
 *
 * Event names are now API surface (docs/02-architecture.md §8): `session/completed`
 * and `sprint/launched` stay stable; a breaking payload change gets a NEW event
 * name, never a silent reshape of an existing one.
 *
 * Payloads carry IDs ONLY — never transcript text, capture content, email bodies,
 * or names. The `nudge/requested` body is the manager-drafted message that the
 * worker emails verbatim; it is the one exception and it never gets logged.
 */

/** Typed event map. `data` shapes are validated by Inngest at send + receive. */
type Events = {
  "session/completed": {
    data: { sessionId: string; tenantId: string };
  };
  "sprint/launched": {
    data: { sprintId: string; tenantId: string };
  };
  "nudge/requested": {
    data: {
      tenantId: string;
      sprintId: string;
      /** The recipient (the participant being nudged). */
      userId: string;
      /** The manager who triggered it (audit attribution). */
      actorId: string;
      channel: "email" | "slack";
      subject?: string;
      /** Manager-drafted message body. Emailed verbatim; NEVER logged. */
      body: string;
    };
  };
  /**
   * Internal: request an opportunity recompute for one sprint. Emitted by the
   * session-completion worker after extraction; the handler debounces ~10min per
   * sprintId so a burst of completions recomputes once. Not a public trigger.
   */
  "opportunity/recompute-requested": {
    data: { sprintId: string; tenantId: string };
  };
};

export const inngest = new Inngest({
  id: "atlas",
  schemas: new EventSchemas().fromRecord<Events>(),
});

export type AtlasEvents = Events;
