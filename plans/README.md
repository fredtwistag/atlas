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
| [011](011-page-e2e-tests.md) | Page + smoke E2E tests | E11 | `e2e/`, page component tests | Todo |

Status values: `Todo` → `In progress` → `Done` (gate green) / `Blocked`.

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
