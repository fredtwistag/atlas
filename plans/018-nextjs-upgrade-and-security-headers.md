# Plan 018: Upgrade Next.js past the middleware-bypass CVE + add security headers

> **Executor instructions**: Follow step by step; verify each step. On any STOP
> condition, stop and report. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 430d2f4..HEAD -- package.json next.config.mjs middleware.ts`
> On mismatch with the excerpts below, STOP.

## Status

- **Priority**: P0 — do this FIRST; everything else builds on it
- **Effort**: S (half a day incl. verification)
- **Risk**: LOW — patch/minor-range framework upgrade; verify gate covers it
- **Depends on**: none. Land before the engine track to avoid rebasing churn.
- **Category**: security / migration
- **Planned at**: commit `430d2f4`, 2026-06-11

## Why this matters

The app pins `next@15.1.6`. Auth gating is middleware-based
(`middleware.ts:44-50` redirects signed-out users to `/sign-in`), and Next.js
versions below 15.2.3 are vulnerable to CVE-2025-29927: a crafted
`x-middleware-subrequest` header skips middleware entirely. Vercel's platform
strips that header (deploy target is Vercel), and most pages carry their own
guards (`requireTenantSession` / `requireManagerOrSponsor` /
`requireTwistagSession` in `lib/auth-guards.ts:12-31`) — so this is
mitigated-but-unpatched, plus `npm audit` reports further criticals (cache
poisoning, DoS) fixed in later 15.x. A public launch should not ship a
known-critical framework pin. While in here, add the missing baseline security
headers — there are none today.

## Current state

- `package.json:42` — `"next": "15.1.6"`; devDeps pin
  `eslint-config-next@15.1.6`.
- `middleware.ts` — full file is the Supabase session refresh + public-path
  check; matcher excludes static assets only, so it runs on every page.
- `next.config.mjs` — no `headers()` at all:

  ```js
  const nextConfig = {
    reactStrictMode: true,
    ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  };
  ```

- Known repo gotcha: do not run `npm run build`/`verify` while `next dev` is
  running (`.next` clobber) — stop the dev server first or use
  `NEXT_DIST_DIR=.next-verify`.

## Commands you will need

| Purpose   | Command                                   | Expected |
|-----------|-------------------------------------------|----------|
| Upgrade   | `npm install next@^15 eslint-config-next@^15` then pin to the latest 15.x shown by `npm view next@^15 version` | exit 0 |
| Audit     | `npm audit --omit=dev`                    | 0 critical/high for next |
| Full gate | `npm run verify`                          | exit 0   |
| E2E       | `npm run test:e2e`                        | all pass |

## Scope

**In scope**: `package.json`, `package-lock.json`, `next.config.mjs`,
`middleware.ts` (only if the upgrade requires API changes — unlikely in 15.x).

**Out of scope**: Upgrading React (stays 19.0.0 unless the Next version
requires a bump — if it does, that's fine, but say so in the PR), any app
code, ESLint config contents.

## Git workflow

- Branch: `chore/018-next-upgrade-headers`; commits e.g.
  `chore(deps): next 15.1.6 → 15.x.y (CVE-2025-29927 + audit criticals)`.
  No push unless asked.

## Steps

### Step 1: Upgrade

Install the latest Next 15.x + matching `eslint-config-next`. Read the Next
15.2/15.3 release notes for breaking changes relevant to: middleware API,
`dynamic = "force-dynamic"`, server actions — this repo uses all three.

**Verify**: `npm run verify` → exit 0. `npm audit --omit=dev` → no
critical/high attributed to `next`.

### Step 2: Confirm middleware behavior

`npm run dev`, then: signed-out request to `/me` → 307 to `/sign-in?next=/me`;
signed-in dev-persona flow still lands correctly; marketing `/` renders signed
out.

**Verify**: `npm run test:e2e` → all pass (covers manager + twistag flows).

### Step 3: Security headers

Add `headers()` to `next.config.mjs` for `/(.*)`:

- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Content-Security-Policy`: start REPORT-ONLY this week (launch safety):
  `default-src 'self'; connect-src 'self' https://*.supabase.co; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'` —
  then check the browser console on: landing, sign-in, dashboard, report,
  admin. Tighten/flip to enforcing post-launch (note left in maintenance).
  Next.js inline runtime needs `'unsafe-inline'` for styles; document each
  allowance with a comment in the config.

**Verify**: `curl -sI localhost:3000 | grep -i strict-transport` shows the
header; no CSP violation reports in console on the five pages above;
`npm run verify` exit 0.

## Test plan

- The repo's full gate + e2e suite is the regression net.
- Manual: the five-page CSP console sweep, signed-in and signed-out.

## Done criteria

- [ ] `next` ≥ 15.2.3 in package.json and lockfile
- [ ] `npm audit --omit=dev` → zero critical/high
- [ ] `npm run verify` and `npm run test:e2e` exit 0
- [ ] Headers present on every response (spot-check `/`, `/me`, `/api/health`)

## STOP conditions

- The upgrade forces a React 19.x minor that breaks tests after one honest fix
  attempt — report with the failing output.
- CSP (even report-only) breaks Supabase auth or fonts — loosen ONLY the
  directive involved, document it, continue.

## Maintenance notes

- Flip CSP from report-only to enforcing within two weeks of launch; remove
  `'unsafe-eval'` once verified unnecessary in production builds.
- Renovate/dependabot isn't configured — consider it post-launch so framework
  CVEs don't recur silently (recorded in P2 list).
