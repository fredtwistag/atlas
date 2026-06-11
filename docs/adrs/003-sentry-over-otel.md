# ADR-003 — Sentry for launch, not OpenTelemetry (yet)

**Status:** Accepted · 2026-06-11
**Owner:** Engineering lead
**Amends:** the "Observability: OpenTelemetry → Highlight or Datadog" line in
`CLAUDE.md` (tech stack) and `docs/02-architecture.md` (observability section).

---

## Context

There was no error tracking, no alerting, and no structured logging in the
codebase. `CLAUDE.md` names "OpenTelemetry → Highlight or Datadog" as the
intended posture, but nothing was installed, and the 2026-06-18 pilot launches
in a week. Launch week needs two concrete things, fast:

1. Every unhandled error (server, edge, browser) captured with enough context
   to locate the failing session — **without** capturing the session's content.
2. A page when the app is down.

A full OpenTelemetry pipeline (collector, exporter, a backend to receive spans,
dashboards) is more moving parts than a one-week runway can absorb, and the
pilot's scale doesn't yet justify the metrics/tracing depth OTel is good at.

The hard constraint is privacy, not vendor choice. Atlas handles conversation
transcripts and IC quotes; CLAUDE.md forbids putting transcripts or PII in
general logs. Any observability tool we adopt has to be wired so message
content and PII **cannot** reach it — whatever the vendor.

## Decision

**Adopt `@sentry/nextjs` for Wave 1 error tracking + alerting, and a minimal
in-repo structured logger (`lib/log.ts`) for breadcrumb-grade logs.** Defer
OpenTelemetry-proper to a post-pilot reconsideration.

Why Sentry for now:

- First-class Next 15 App Router support: one SDK covers the Node.js server,
  the Edge runtime, and the browser, plus React Server Component errors via
  `onRequestError`.
- Free tier fits pilot scale; alert rules (any error → email/Slack) are built in
  — no separate alerting stack to stand up.
- It composes cleanly with what plan 022 already built: Sentry init lives
  alongside `validateEnv()` in `instrumentation.ts` `register()`, and the
  Sentry build wrap preserves plan 018's security headers and
  `outputFileTracingRoot` in `next.config.mjs`.

Privacy is enforced at a single chokepoint, not per call site:

- `lib/sentry-scrub.ts` `beforeSend` is shared by all three runtimes. It drops
  request bodies wholesale, reduces `user` to an id, and redacts any value under
  a content/PII-shaped key (`content|message|summary|sourceQuote|email|body|…`).
- `sendDefaultPii: false` everywhere; **Session Replay disabled entirely**
  (replay records the DOM, which on a conversation surface is transcript text).
- Services attach the `Error` plus a tiny scalar tag set (`area`, `tenantId`,
  `sessionId`) only — never the prompt, the quote, or a name. An ID is not PII
  in our model; the thing it points at is.

## Consequences

- One vendor, fast to land, alerting included. The privacy guarantee is one file
  (`sentry-scrub.ts`) — when voice/Slack land in v1.5, their surfaces inherit it
  for free; keep `beforeSend` the single chokepoint.
- We accept Sentry's client bundle on the browser. Session Replay (the heavy
  integration) is off, so the marketing page stays lean; revisit if the bundle
  delta grows.
- A DSN is **optional in every environment** (`lib/env.ts`). With no DSN, Sentry
  inits an inert client — local/CI and a DSN-less prod boot behave identically,
  so a missing DSN can never break a build or a deploy the way a missing
  `RESEND_API_KEY` does. Error tracking is "off" until the operator sets the DSN
  in Vercel (see `docs/runbooks/deploy.md` §5/§9).
- This is a deviation from CLAUDE.md's "OpenTelemetry →" line, recorded here per
  the "architectural deviations need an ADR" rule. **Reconsider OTel post-pilot**
  when metrics/tracing depth and multi-service correlation start to matter; the
  scrubbing discipline (strip content before export) carries over unchanged.
- Out of scope for Wave 1 (post-launch): metrics dashboards, tracing sample
  tuning, log drains.
