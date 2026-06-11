# Atlas Improvement Sweep — execution tracker

Split from `/Users/fred/.claude/plans/this-current-project-and-toasty-sparrow.md`.
**Base commit:** `5eff48f` · **Branch:** `improve/full-sweep`

Each item below is a self-contained work unit. Execute in numeric order (A → E).
Every item follows TDD (test first, watch it fail, then implement) and must pass the
full gate before being marked Done:

```
npm run typecheck && npm run lint && npm test && npm run test:integration && npm run build
```

(After item 010, this is available as `npm run verify`.) UI items (B, C) also require
dev-server preview verification at 375 / 768 / 1280 px with screenshots.

## Status

| # | Item | Plan | Files | Status |
|---|------|------|-------|--------|
| [001](001-captures-scope.md) | Scope captures count to sprint | A1 | `server/trpc/routers/sprint.ts` | Done |
| [002](002-auth-redirect.md) | Validate post-login redirect | A2 | `app/auth/callback/route.ts` | Done |
| [003](003-parallel-lookups.md) | Parallelize manager/sponsor lookups | A9 | `server/trpc/routers/sprint.ts` | Done |
| [004](004-confirm-dialog.md) | Accessible ConfirmDialog | B3 | `components/ui/ConfirmDialog.tsx`, `MemberRow.tsx`, `CloseSprintButton.tsx` | Done |
| [005](005-opportunity-tablist.md) | Opportunity tabs → real tablist | B4 | `components/opportunity/OpportunityDetail.tsx` | Done |
| [006](006-icon-tap-targets.md) | ≥44px icon tap targets | B5 | `components/ui/Button.tsx` + icon buttons | Done |
| [007](007-aria-live-status.md) | Announce async status | B7 | `NudgeComposer.tsx`, `LaunchSprintForm.tsx`, `ConversationView.tsx` | Done |
| [008](008-tablet-reflow.md) | Tablet reflow + stat breakpoints | C6a/C6b | `OpportunityDetail.tsx`, `sprint/[id]/page.tsx`, `twistag/page.tsx` | Done |
| [009](009-mock-data-quarantine.md) | Quarantine mock data | D8 | `lib/format.ts`, shipped routes/components | Done |
| [010](010-verify-script-ci.md) | verify script + CI format gate | D10 | `package.json`, `.github/workflows/ci.yml`, `README.md` | Done |
| [011](011-page-e2e-tests.md) | Page + smoke E2E tests | E11 | `e2e/`, page component tests | Done |
| [012](012-admin-super-area.md) | Twistag admin super-area (visibility/control/audit) | — | `app/(app)/admin/**`, `server/trpc/routers/twistag.ts`, `db/client.ts`, `lib/twistag-admin.ts`, `components/AppSidebar.tsx` | Done |

Status values: `Todo` → `In progress` → `Done` (gate green) / `Blocked`.

## Launch-readiness set (013–027) — see [LAUNCH.md](LAUNCH.md)

Added 2026-06-11 by the launch audit (planned at `430d2f4`). **LAUNCH.md is the
master index for this set** — dependency order, day-by-day sequence, P2
fast-follow backlog, and rejected findings live there. Summary:

| # | Item | Priority | Status |
|---|------|----------|--------|
| [013](013-llm-service-and-conversation-engine.md) | LLM service + conversation engine | P0 | Done |
| [014](014-capture-extraction-pipeline.md) | Capture extraction pipeline | P0 | Todo |
| [015](015-conversation-ui-live-wiring.md) | Live conversation UI, retire mock | P0 | Todo |
| [016](016-opportunity-engine.md) | Opportunity engine + curation safety valve | P0 | Todo |
| [017](017-ic-edit-window-and-session-authz.md) | IC edit persistence + session authz | P0 | Done |
| [018](018-nextjs-upgrade-and-security-headers.md) | Next.js CVE upgrade + headers | P0 | Todo |
| [019](019-rate-limiting.md) | Rate limiting (auth + email) | P0 | Todo |
| [020](020-inngest-background-workers.md) | Inngest workers + digests | P0/P1 | Todo |
| [021](021-legal-pages-and-gdpr-runbook.md) | Legal pages + GDPR runbook | P0 | Todo |
| [022](022-prod-cutover.md) | Prod cutover + DEPLOY runbook | P0 | Todo |
| [023](023-observability.md) | Sentry + logs + uptime | P1 | Todo |
| [024](024-lifecycle-guards-and-empty-states.md) | Lifecycle guards + empty states | P1 | Done |
| [025](025-invitation-expiry-and-nudge-optout.md) | Invite expiry + nudge opt-out | P1 | Todo |
| [026](026-perf-and-caching-pass.md) | Perf + caching pass | P1 | Todo |
| [027](027-test-hardening.md) | Test hardening + privacy regression net | P1 | Todo |

**012 note:** written against `e323025`, approved by Fred 2026-06-10. Five shippable
phases (0–5), each gated by `npm run verify`; execute phases in order, data layer
before UI. Routes consolidate under `/admin` (not `/twistag`). Full detail in the
plan file — it is self-contained.

## Launch plans (013–027)

Tracked separately from the sweep above (these target the 2026-06-18 pilot launch).

- **022 — prod cutover (env validation + health checks + deploy runbook): Done.**
  `lib/env.ts` (+ test) tiered Zod env contract; `validateEnv()` wired into
  `instrumentation.ts` `register()` (runtime boot only — guarded to no-op during
  `next build` and outside production, so the shared `npm run verify` gate stays
  green with no `.env.local`). `app/api/health/route.ts` does real DB `SELECT 1`
  / email-key / llm-key checks (200 if DB ok, else 503; no secrets). `robots.ts`,
  `sitemap.ts`, `app/layout.tsx` metadataBase, derive their base URL from
  `APP_URL`. `app/dev/components` now 404s in prod. `docs/runbooks/deploy.md` is
  the operator cutover checklist (Supabase EU project → migrations → auth hook →
  Resend → Vercel env table → first-client bootstrap → go/no-go smoke →
  rollback). The "prod build with missing RESEND fails loud" criterion is met via
  `lib/env.test.ts` (prod-tier schema throws, naming each key) + the runtime
  guard, NOT a build-time failure.

- **023 — observability (error tracking + structured logs + uptime): Done.**
  `@sentry/nextjs` wired for server/edge (`sentry.server.config.ts`,
  `sentry.edge.config.ts`, imported from `instrumentation.ts` `register()`
  ALONGSIDE the existing `validateEnv()`) and browser (`instrumentation-client.ts`).
  `next.config.mjs` wrapped with `withSentryConfig` — plan 018's security headers
  + `outputFileTracingRoot` preserved untouched. **No-DSN no-op:** `SENTRY_*` keys
  are OPTIONAL in every tier of `lib/env.ts`, so a missing DSN inits an inert
  client and never breaks boot/build (build verified green with no DSN set).
  PII/transcript scrubbing at ONE chokepoint (`lib/sentry-scrub.ts` `beforeSend`:
  drops request bodies, reduces user→id, redacts content/PII-keyed values;
  `sendDefaultPii:false`; Session Replay off). Structured logger `lib/log.ts`
  (one-line JSON, IDs/counts only) replaces every ad-hoc `console.*` in
  `services/`/`server/`/`lib/` (email skip+fail, conversation extract warnings).
  Capture at the LLM + email failure hotspots tagged `area`/`tenantId` via
  `lib/observability.ts` (jobs hotspot deferred — `services/jobs/` lands with
  plan 020). `app/(app)/error.tsx` + new `app/global-error.tsx` forward to Sentry.
  ADR-003 records Sentry-over-OTel. Runbook §9 (+ `.env.example`, §5 env table)
  is the operator checklist: create the Sentry project, set the DSN in Vercel,
  add the alert rule, and point an uptime monitor at `/api/health`.

## Execution order & rationale

- **Plan A (001–003)** first: small, high-trust correctness/security/perf. Low risk.
- **Plan B (004–007)** the a11y/UX core: new canonical `ConfirmDialog` + tablist patterns.
- **Plan C (008)** mobile-responsive pass; depends on B's components being in place.
- **Plan D (009–010)** tech-debt & DX; 010 adds the `verify` one-shot gate.
- **Plan E (011)** largest; page + Playwright smoke. Do after A–D land.

## Rules (from CLAUDE.md + goal brief)

- Strict TS, no `any` without disable+reason. Zod on every input. No barrel files.
- Co-locate tests next to source.
- **Do not touch RLS policies.** Any RLS change needs 2 approvals + adversarial test (ADR-001).
- Design tokens (`design/tokens.css`), not ad-hoc colors. Copy style: short, active,
  error messages say what happened + what to do.
- Never commit/push to `main`; never push without being asked.
