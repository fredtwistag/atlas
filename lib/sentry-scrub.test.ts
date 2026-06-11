import { describe, it, expect } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { scrubEvent, SENTRY_PRIVACY_OPTIONS } from "./sentry-scrub";

/**
 * The test that matters (plan 023, Step 2). Feed `beforeSend` a fake event
 * carrying the things that must never reach Sentry — a `sourceQuote`, a
 * transcript message, an email — and assert they are gone, while the IDs we DO
 * want (tenantId, sessionId) survive.
 */

describe("scrubEvent (Sentry beforeSend)", () => {
  it("strips a sourceQuote extra but keeps tenant/session IDs", () => {
    const event = {
      extra: {
        sourceQuote: "I spend 3 hours a day reconciling the spreadsheet",
        summary: "manual reconciliation toil",
        tenantId: "tenant-123",
        sessionId: "session-456",
        count: 4,
      },
    } as unknown as ErrorEvent;

    const out = scrubEvent(event);

    expect(out.extra?.sourceQuote).toBe("[redacted]");
    expect(out.extra?.summary).toBe("[redacted]");
    // IDs and counts survive — they are not PII and are what an operator needs.
    expect(out.extra?.tenantId).toBe("tenant-123");
    expect(out.extra?.sessionId).toBe("session-456");
    expect(out.extra?.count).toBe(4);
  });

  it("drops the request object wholesale (bodies, headers, cookies)", () => {
    const event = {
      request: {
        data: { message: "a whole conversation turn" },
        cookies: { session: "secret" },
        headers: { authorization: "Bearer xyz" },
      },
    } as unknown as ErrorEvent;

    const out = scrubEvent(event);
    expect(out.request).toBeUndefined();
  });

  it("reduces the user to an id only (no email/username/ip)", () => {
    const event = {
      user: {
        id: "user-789",
        email: "ic@client.com",
        username: "Real Name",
        ip_address: "1.2.3.4",
      },
    } as unknown as ErrorEvent;

    const out = scrubEvent(event);
    expect(out.user).toEqual({ id: "user-789" });
  });

  it("scrubs nested content under contexts and breadcrumb data", () => {
    const event = {
      contexts: {
        conversation: { message: "the user's words", sessionId: "s1" },
      },
      breadcrumbs: [
        {
          category: "llm",
          message: "llm.complete.failed",
          data: { prompt: "system prompt text", tenantId: "t1" },
        },
      ],
    } as unknown as ErrorEvent;

    const out = scrubEvent(event);
    const convo = out.contexts?.conversation as Record<string, unknown>;
    expect(convo.message).toBe("[redacted]");
    expect(convo.sessionId).toBe("s1");
    const crumb = out.breadcrumbs?.[0]?.data as Record<string, unknown>;
    expect(crumb.prompt).toBe("[redacted]");
    expect(crumb.tenantId).toBe("t1");
  });

  it("scrubs an email key anywhere it appears", () => {
    const event = {
      tags: { area: "email", recipientEmail: "person@corp.com" },
    } as unknown as ErrorEvent;

    const out = scrubEvent(event);
    expect(out.tags?.area).toBe("email");
    expect(out.tags?.recipientEmail).toBe("[redacted]");
  });

  it("SENTRY_PRIVACY_OPTIONS pins sendDefaultPii:false and wires the scrubber", () => {
    expect(SENTRY_PRIVACY_OPTIONS.sendDefaultPii).toBe(false);
    expect(SENTRY_PRIVACY_OPTIONS.beforeSend).toBe(scrubEvent);
  });
});
