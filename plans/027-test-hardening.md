# Plan 027: Test hardening — lifecycle e2e, email-send visibility, privacy regression net

> **Executor instructions**: Follow step by step; verify each step. On any STOP
> condition, stop and report. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 430d2f4..HEAD -- e2e/ services/email/ db/sow-drafts.integration.test.ts .github/workflows/ci.yml`
> This plan assumes the engine track (013-015) and 020 have landed; if not,
> write the lifecycle e2e against the current flows and note which assertions
> are deferred.

## Status

- **Priority**: P1 — the regression net for everything launch week shipped
- **Effort**: M
- **Risk**: LOW
- **Depends on**: ideally last — after plans 013-025
- **Category**: tests
- **Planned at**: commit `430d2f4`, 2026-06-11

## Why this matters

Launch week lands ~10 plans of change. The suite is healthy (unit +
integration + smoke e2e, `npm run verify` gate in CI) but has four gaps that
map exactly to what could embarrass the pilot: no e2e covers the full
sprint lifecycle; email sends are fire-and-forget with no logged outcome and
no send-layer test beyond mocks; the IC-anonymity rule ("no names in
manager-facing evidence") has no regression test; `sow_drafts` lacks the
standard cross-tenant adversarial test.

## Current state

- `e2e/smoke.spec.ts` — 5 specs: manager dashboard→opportunity→SOW, twistag
  admin flows. Uses `/sign-in/dev` one-click personas. Config
  `playwright.config.ts`: not in the CI gate (needs seeded dev Supabase —
  header comment explains; keep it that way unless CI gets a seeded project).
- Email: `services/email/send.test.ts` mocks render+resend;
  `emails/*.test.tsx` cover template content. Send RESULTS are dropped:
  launch invites run `Promise.allSettled` with no result inspection
  (`server/trpc/routers/sprint.ts:309-330` pre-020; the 020 worker makes
  per-IC steps visible — this plan adds the logging either way).
- Privacy rule: `server/trpc/routers/opportunity.ts:38-52` maps users.title →
  `contributorRole`, excludes names — correct today, untested against
  regression.
- `db/sow-drafts.integration.test.ts` exists; verify whether it includes the
  cross-tenant 0-rows adversarial case (the audit suspected not — read it
  first; if present, mark that item done in the PR and move on).
- CI: `.github/workflows/ci.yml` runs verify + integration.

## Commands you will need

| Purpose     | Command                    | Expected |
|-------------|----------------------------|----------|
| Unit        | `npm test`                 | all pass |
| Integration | `npm run test:integration` | all pass |
| E2E         | `npm run test:e2e`         | all pass (seeded dev Supabase + dev server) |
| Full gate   | `npm run verify`           | exit 0   |

## Scope

**In scope**:
- `e2e/lifecycle.spec.ts` (create)
- `services/email/send.ts` + send-site callers (result logging via `lib/log`
  from plan 023; if 023 absent, `console.info` JSON one-liner with a TODO)
- `server/trpc/router.integration.test.ts` or co-located router tests
  (anonymity regression; auth-callback claims test)
- `db/sow-drafts.integration.test.ts` (adversarial case if missing)
- `lib/sow.test.ts` (boundary cases)

**Out of scope**: CI restructuring (e2e stays out of the gate), load tests,
coverage tooling.

## Git workflow

- Branch: `test/027-hardening`; conventional commits. No push unless asked.

## Steps

### Step 1: Lifecycle e2e

`e2e/lifecycle.spec.ts`, one serial spec (workers:1 already):
manager launches a sprint (or reuses seeded active) → IC persona signs in,
acks privacy if shown, opens a session, sends one message (LLM may be live or
absent — assert on bubble count / typed-error rendering, not content),
completes → manager sees progress tick → manager/sponsor opens report →
sponsor approves an opportunity → SOW sheet appears → manager closes sprint →
nudge now blocked (plan 024 copy). Reuse the dev sign-in helpers from
`e2e/smoke.spec.ts` (extract a `signInAs(page, email)` helper into
`e2e/helpers.ts`).

**Verify**: `npm run test:e2e` green twice in a row (flake check).

### Step 2: Email send visibility

Every send site logs the outcome: `{event: "email.sent"|"email.skipped"|
"email.failed", template, to_domain (domain only — not the address), id}`.
In the 020 worker, failed steps already retry — add the same structured log.
Unit-test: a failing Resend mock produces an `email.failed` log and (workers)
a thrown error; `allSettled` sites count failures and log a summary line.

**Verify**: `npm test -- services/email` green; grep shows no full email
addresses in log calls (`to_domain` only).

### Step 3: Privacy regression net

Integration test: seed capture + evidence + opportunity; call
`opportunity.get` as manager; assert the JSON, serialized, contains the
contributor's role/title and does NOT contain the contributor's name or email
anywhere (`JSON.stringify(result).includes(name) === false`). Same assertion
against `sprint.progress` and the report-feeding queries. This is the test
CLAUDE.md's privacy rule has been missing.

**Verify**: test fails if you deliberately add `users.name` to the select
(try it, revert) — proof the net works.

### Step 4: Small high-value fills

- `db/sow-drafts.integration.test.ts`: tenant-B-reads-tenant-A → 0 rows (copy
  the captures-test pattern) — if absent.
- `lib/sow.test.ts`: boundary cases — zero/one opportunity input, extreme
  impact ranges; assert price/duration stay in sane bounds (read `lib/sow.ts`
  fully first; it is small).
- Auth callback: integration test that a JWT with claims lands the right
  role path and a claims-less session falls back safely (model on
  `db/auth-hook.integration.test.ts` setup).

**Verify**: `npm run verify` exit 0.

## Test plan

This plan IS the test plan; the meta-check is flake resistance: run the new
e2e twice and the integration suite once more after a `git clean`-fresh
install if time allows.

## Findings (executed 2026-06-12)

Several Step-2/Step-4 items had already landed via plans 020/023/025 before this
plan ran; per the plan's "if present, mark done and move on" guidance they were
verified, not re-built:

- **Step 2 (email visibility): already landed + strengthened.** `sendEmail`
  (services/email/send.ts) logs content-free `email.send.skipped`/`.failed`
  (area only, never `to`/`subject`); every Inngest worker adds per-step
  `*.send.failed`/`.complete` summary lines. Added a regression test asserting
  the failure log is content-free and reaches Sentry (`area:email`).
- **Step 3 (privacy net): the real gap — now closed.** Added names-never
  assertions on `opportunity.get` evidence, `opportunity.listForSprint` (report
  feed) and `sprint.progress`, plus a manager-cannot-read-IC-transcript test.
  Proven to catch a seeded violation (temporarily added `users.name` to the
  evidence select → red → reverted). No defect found: the engine's `userName`
  is used only in the IC's own conversation prompt and never flows into the
  extraction/captures path that feeds manager-facing evidence.
- **Step 4: sow_drafts adversarial + auth-callback already present.**
  `db/sow-drafts.integration.test.ts` already has the tenant-B-reads-0-rows
  case; `db/auth-hook.integration.test.ts` already covers claims→role and
  claims-less fallback. Added the missing `lib/sow.test.ts` boundary cases.
- **Step 1 (lifecycle e2e): written, execution deferred.** `e2e/lifecycle.spec.ts`
  + `e2e/helpers.ts` are written and parse/list cleanly; they stay out of the CI
  gate (non-hermetic: needs :3000 + seeded Supabase + ANTHROPIC). Not run here —
  the only reachable :3000 server returned HTTP 500 (a different process/state).
  Deferred to a manual/CI run with a seeded ephemeral project.

## Done criteria

- [x] `npm run verify` exits 0 (typecheck/lint/unit/integration/build all 0);
  `npm run test:e2e` deferred (non-hermetic — see Findings)
- [x] Lifecycle spec covers launch→session→report→approve→close→nudge-blocked
- [x] Anonymity regression test in place and proven to catch the seeded
  violation
- [x] Email outcomes visible in logs at every send site, domains only
- [x] sow_drafts adversarial + sow boundary + auth-callback tests present

## STOP conditions

- The lifecycle e2e cannot pass without live LLM AND the operator hasn't
  provided a dev key — write the spec to tolerate the typed
  "engine not configured" path and note it; do NOT mock the engine inside e2e.
- Flake you cannot fix in two attempts — quarantine with `test.fixme` + report
  (a flaky gate is worse than a known gap).

## Maintenance notes

- New roles or report surfaces must extend the anonymity assertion — it's the
  single test guarding the product's core privacy promise.
- When CI gets a seeded ephemeral Supabase (P2), promote `test:e2e` into the
  PR gate.
