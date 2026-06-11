# Plan 023: Observability — error tracking, structured logs, uptime

> **Executor instructions**: Follow step by step; verify each step. On any STOP
> condition, stop and report. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 430d2f4..HEAD -- next.config.mjs app/api/health/ services/ package.json`

## Status

- **Priority**: P1 — land before clients use the product in anger
- **Effort**: M
- **Risk**: LOW — additive
- **Depends on**: plans/022 (env validation + health checks exist), plans/018
  (config churn in next.config.mjs — merge order matters, coordinate)
- **Category**: dx
- **Planned at**: commit `430d2f4`, 2026-06-11

## Why this matters

There is no error tracking, no alerting, and no structured logging. CLAUDE.md
promises "OpenTelemetry → Highlight or Datadog"; nothing is installed. During
the pilot, a failed LLM call, email send, or DB error surfaces only if a
client emails Twistag. Launch week needs: every unhandled error captured with
context, and a ping when the app is down.

## Current state

- `package.json`: no Sentry/OTel/Highlight/Datadog of any kind.
- Errors today: tRPC default error formatting; React error boundaries
  (`app/(app)/error.tsx` exists); `console.*` scattered.
- Privacy constraints (CLAUDE.md): no conversation transcripts in general
  logs; no PII in logs. This SHAPES the Sentry config — see Step 2.
- Pragmatic choice: `@sentry/nextjs` (one vendor, first-class Next 15 App
  Router support, free tier fits pilot scale). OTel-proper can come later;
  record the deviation from CLAUDE.md's "OpenTelemetry →" line as an ADR
  one-pager (Step 4) since CLAUDE.md says architectural deviations need one.

## Commands you will need

| Purpose   | Command                       | Expected |
|-----------|-------------------------------|----------|
| Install   | `npm install @sentry/nextjs`  | exit 0   |
| Full gate | `npm run verify`              | exit 0   |

## Scope

**In scope**:
- `package.json`, `next.config.mjs` (Sentry wrap), `sentry.*.config.ts`
  (client/server/edge), `instrumentation.ts`
- `lib/log.ts` + test (create — minimal structured logger)
- `services/llm/client.ts`, `services/email/send.ts`,
  `services/jobs/functions/*` (breadcrumbs/captures at the three failure
  hotspots)
- `docs/adrs/ADR-003-sentry-over-otel.md` (create)
- `docs/runbooks/deploy.md` (append env vars + alert setup section)

**Out of scope**: metrics dashboards, tracing sampling tuning, log drains —
post-launch.

## Git workflow

- Branch: `feat/023-observability`; conventional commits. No push unless asked.

## Steps

### Step 1: Sentry baseline

`npx @sentry/wizard@latest -i nextjs` or manual setup per Sentry's Next 15 App
Router docs. DSN via env (`NEXT_PUBLIC_SENTRY_DSN` optional in dev — no DSN =
disabled, app must run fine without it). `tracesSampleRate: 0.1`, errors 100%.

**Verify**: `npm run verify` exit 0 with and without DSN set; a deliberate
`throw` in a dev route appears in Sentry (or in the offline transport log).

### Step 2: PII scrubbing — the non-negotiable step

In every Sentry config: `beforeSend` strips request bodies; set
`sendDefaultPii: false`; scrub keys matching
`/content|message|summary|sourceQuote|email|body/i` from contexts/extras;
disable session replay entirely. The conversation surfaces (engine, extract,
session router) must never attach message content to events — capture
sessionId/tenantId only. Add `lib/log.ts`: `log.info/warn/error(event:
string, fields: Record<string, string|number|boolean>)` emitting one-line JSON
— by convention fields carry IDs and counts, never content; replace the
`console.info` in `services/email/send.ts:39` and any engine logging with it.

**Verify**: unit test on the `beforeSend` scrubber (feed a fake event with a
`sourceQuote` extra → stripped). `grep -rn "console\." services/ server/ | grep -v test` → zero (all through lib/log or Sentry).

### Step 3: Hotspot instrumentation

Wrap the three launch-critical failure points with explicit capture +
context tags (`area: llm|email|jobs`): LLM call failures (after retries),
email send throws, Inngest function failures (Sentry's Inngest integration or
a try/catch in each function body). Tag every event with `tenantId` (an ID is
not PII in our model; names/emails are).

**Verify**: force each failure in dev (bogus keys) → three tagged events.

### Step 4: Alerts + uptime + ADR

- Sentry alert rule: any error event → email/Slack to Twistag (operator
  connects the channel; document in runbook).
- Uptime: a checker hitting `/api/health` expecting 200 — Vercel's monitoring
  or a free Better Stack/UptimeRobot check; document choice + setup in
  `docs/runbooks/deploy.md` §5 slot.
- `docs/adrs/ADR-003-sentry-over-otel.md`: context, decision (Sentry now, OTel
  reconsidered post-pilot), consequences. Follow `docs/adrs/ADR-002`'s format.

**Verify**: runbook section exists; ADR committed; operator can see a test
alert.

## Test plan

- Scrubber unit test (the one that matters).
- `lib/log.test.ts`: shape + no-content convention documented in the test.
- Gate + e2e remain green.

## Done criteria

- [ ] `npm run verify` exits 0 (with and without DSN)
- [ ] Forced LLM/email/job failures produce tagged, scrubbed events
- [ ] Zero raw `console.*` outside tests
- [ ] ADR-003 written; runbook updated with DSN + alert + uptime rows

## STOP conditions

- Sentry's Next integration conflicts with the plan-018 CSP (report-only
  violations are fine; enforcement breakage is not) — coordinate, don't widen
  CSP silently beyond adding the Sentry ingest origin to `connect-src`.
- Bundle size impact of Sentry client >50KB gzip on the marketing page —
  scope Sentry client to the (app) group / lazy init and note it.

## Maintenance notes

- When voice/Slack land (v1.5), their webhook surfaces need the same scrubbing
  discipline — `beforeSend` is the single chokepoint, keep it that way.
