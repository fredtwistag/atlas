# Front-end hardening — design spec

**Date:** 2026-06-09
**Status:** Implemented (branch `frontend-hardening`)
**Owner:** fred@twistag.com
**Scope decision:** Full foundation hardening + Vitest/RTL/CI (chosen 2026-06-09)

---

## 1. Context

The Atlas repo now contains a runnable Next.js 15 app (31 TS/TSX files) built from
the specs and prototypes. The UI layer is strong; the gaps are foundational —
the things that get expensive once the backend (Supabase + RLS, Stytch, Anthropic,
Inngest, Resend) leans on them. This pass hardens that foundation **before**
backend plumbing, so the backend work starts on clean, conventional ground.

This spec covers only the current front-end + data-seam layer. It does **not**
implement any backend service; it shapes the seams those services will plug into.

## 2. Goals

- Eliminate the duplication that will drift (tone maps, stat cards, back links,
  opportunity card, hand-rolled progress bars).
- Make the data layer **async** so the eventual swap to real queries is a no-op
  at call sites, and build the `loading`/`error` boundaries that async requires.
- Adopt canonical Next.js 15 practices: `next/font`, per-route metadata,
  segment-level `loading.tsx`/`error.tsx`.
- Establish quality gates: ESLint + Prettier, Vitest + RTL, GitHub Actions CI
  (typecheck + lint + test + build), and stop ignoring lint at build time.
- Fix the WCAG-AA blockers (muted-text contrast, modal keyboard a11y, labels).
- Collapse the design-token / Tailwind-config duplication to a single source.

## 3. Non-goals

- No backend services, tRPC server, DB, or auth wiring (next phase).
- No new product screens or features. Behaviour stays identical (refactor + harden).
- No visual redesign beyond the contrast fix. Prototype fidelity is preserved
  except where AA requires the muted-text change (§6.2).
- No exhaustive test coverage — a representative, meaningful baseline only.

## 4. Architecture / approach

**Safety-net-first, then dependency-ordered waves.** Quality gates land before any
code moves, so every subsequent change is guarded by typecheck + lint + tests.
Each wave keeps the build and tests green and is independently verifiable.

```
Wave 1  Safety net & gates ──► Wave 2  Token SoT ──► Wave 3  Shared primitives
                                                            │
Wave 6  Tests + green CI ◄── Wave 5  Fonts/metadata/a11y ◄── Wave 4  Async seam
```

## 5. Detailed design by wave

### Wave 1 — Safety net & quality gates
- `.eslintrc.json` extending `next/core-web-vitals` + `next/typescript`.
- `.prettierrc` (+ `.prettierignore`); add `format` / `format:check` scripts.
- `.nvmrc` (Node 22) and `"engines": { "node": ">=22" }` in package.json.
- `.env.example` documenting the env vars the backend phase will introduce
  (Supabase URL/keys, Stytch, Anthropic, Resend, Inngest) — all commented, no values.
- Vitest + React Testing Library + jsdom: `vitest.config.ts`, `vitest.setup.ts`
  (jest-dom matchers), scripts `test` / `test:watch`.
- `.github/workflows/ci.yml`: on push/PR → `npm ci` → `typecheck` → `lint` →
  `test` → `build`.
- Remove `eslint.ignoreDuringBuilds` from `next.config.mjs` once lint passes clean.

**Verify:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` all green locally; CI green on the branch.

### Wave 2 — Single source of truth
- `design/tokens.css` and `design/tailwind.config.js` are the **only** copies.
- `app/globals.css` imports the canonical tokens (`@import "../design/tokens.css";`
  ordered before `@tailwind` directives); base typography stays in an
  `@layer base` block so Preflight can't clobber it.
- Root `tailwind.config.js` imports and spreads the design theme:
  `const design = require("./design/tailwind.config.js")` → reuse `theme`, set
  app `content` globs. No theme values re-declared at root.

**Verify:** computed token values unchanged (spot-check `--brand`, `--text`, radii); build unaffected.

### Wave 3 — Shared primitives & centralized maps (pure refactor)
- `lib/ui-maps.ts` — single export each, typed by the domain enums in `lib/types.ts`:
  `participantStatusMeta`, `clientHealthMeta`, `captureKindTone`,
  `opportunityStatusMeta`. All current inline maps deleted in favour of these.
- `components/ui/StatCard.tsx` — props `{ icon, label, value, sub? }`; consumed by
  manager dashboard, twistag cockpit, and opportunity metrics.
- `components/ui/BackLink.tsx` — props `{ href, children }`; consumed by opportunity,
  report, nudge, edit.
- `components/ui/Sheet.tsx` — accessible right-side dialog primitive:
  `role="dialog"`, `aria-modal`, Escape-to-close, focus trap, focus return to the
  trigger, backdrop click to close. The approve-for-FDE sheet moves onto it.
- `components/opportunity/OpportunityCard.tsx` — the ranked card; manager dashboard
  and final report both consume it (eliminates the inlined duplicate).
- `OpportunityDetail` score-breakdown bars switch to the existing `ProgressBar`
  primitive (add an optional label/value affordance if needed) — no raw bar divs.

**Verify:** visual diff is nil (screenshots match pre-refactor); typecheck green; behaviour identical.

### Wave 4 — Backend-readiness seam
- `lib/data.ts`: every `db.*` function becomes `async` (returns `Promise<T>`).
  Bodies still read fixtures; signatures match the future query shape.
- All 17 call sites `await` (server components already async; client components
  that read data get it via props from server components — no client-side fetch
  introduced).
- `lib/session.ts` — `getCurrentUser(): Promise<User>` and a `getSession()` seam
  returning `{ user, tenantId, role }`; replaces every `db.me()`.
- `lib/schemas.ts` — Zod schemas for `Capture` and `Opportunity` (mirrors the
  shapes in `docs/02-architecture.md §6.3`), establishing the "validate every
  boundary" pattern CLAUDE mandates. Types are inferred from the schemas where
  practical.
- `loading.tsx` + `error.tsx`:
  - `app/(app)/loading.tsx` (shell skeleton) and `error.tsx` (recoverable boundary
    with reset).
  - Route-level `loading.tsx` for the data-heavy dynamic routes (`/sprint/[id]`,
    `/sprint/[id]/opportunity/[oppId]`, `/sprint/[id]/report`) with skeletons that
    match the real layout dimensions (ATL-604 intent).

**Verify:** all routes still render; throttling/delaying a `db.*` call shows the
skeleton then content; a thrown error shows the boundary, not a crash.

### Wave 5 — Fonts, metadata, accessibility
- `app/fonts.ts`: `Inter`, `Fraunces`, `JetBrains_Mono` via `next/font/google`,
  exposed as CSS variables consumed by the token `--font-*` vars; remove the
  Google `<link>` from `layout.tsx`.
- Metadata: `metadata`/`generateMetadata` titles on every route (`/me`, `/sprint/[id]`,
  `/sprint/[id]/opportunity/[oppId]`, `/twistag`, `/session/[id]`, report, nudge,
  edit). Add `app/robots.ts` + `app/sitemap.ts` for the marketing surface.
- A11y:
  - **Muted-text contrast (§6.2):** introduce an AA-passing muted text value for
    text use; reserve the faint tone for decorative dividers only.
  - Conversation `<textarea>` gets a real `aria-label`; the capture side-panel
    becomes an `aria-live="polite"` region so new captures are announced.
  - `prefers-reduced-motion` guard on the typing-bounce and transitions.
  - Footer "links" become real anchors/buttons.

**Verify:** Lighthouse a11y ≥ 95 on `/`, `/me`, `/sprint/[id]`; axe shows no
critical violations; keyboard-only walkthrough of the approve sheet works
(open, trap, Escape, focus returns).

### Wave 6 — Tests fill-in & green CI
- Co-located unit tests: `Button.test.tsx`, `Badge.test.tsx`, `ScoreBadge.test.tsx`,
  `ProgressBar.test.tsx` (variants/props render correctly).
- Behavioural tests:
  - `ConversationView` — sending a reply appends the user message and surfaces a
    capture in the side panel; progress advances.
  - `OpportunityDetail` — opening the sheet shows the SOW; "Send to Twistag"
    transitions to the approved state.
- CI green end-to-end.

**Verify:** `npm test` passes; CI run is green on the PR.

## 6. Key decisions

### 6.1 Token single source of truth
`design/` stays canonical (per CLAUDE.md). The app imports it rather than mirroring
it. Chosen over "make `app/` canonical" because CLAUDE already names `design/` the
source of truth and the design system is referenced from there.

### 6.2 Muted-text contrast vs. prototype fidelity
`--text-3` (#a1a1aa) on white ≈ 2.6:1, failing WCAG AA. Decision: use an AA-passing
muted value (~#71717a, ≈4.6:1) for **text**, and keep the faint #a1a1aa only for
decorative, non-text elements (hairline dividers, inactive icons). Trade-off:
secondary text reads slightly darker than the prototypes. Approved direction;
revisit during spec review if the lighter look must be preserved.

### 6.3 Async data layer now
Converting `db.*` to async now (vs. during backend work) is chosen so the backend
swap touches only the function bodies, not the 17 call sites, and so the
`loading`/`error` boundaries are designed against real async behaviour rather than
retrofitted.

### 6.4 Sheet/Dialog primitive
Rather than patch a11y into the one approve sheet, extract a reusable `<Sheet>`
primitive (the architecture already anticipates shadcn `dialog`/`sheet`). Serves
both reuse and a11y, and is ready for future drawers (nudge, capture detail).

## 7. Risks & mitigations

- **Refactor regressions** — mitigated by Wave 1 landing tests/CI first, and by
  screenshot/behaviour parity checks after Wave 3.
- **Token `@import` ordering with Tailwind Preflight** — base typography kept in
  `@layer base`; verify computed styles unchanged.
- **`next/font` + variable-font CSS vars** — wire font CSS variables into the
  existing `--font-*` tokens; verify Fraunces italics and JetBrains Mono still render.
- **Async conversion missing a call site** — typecheck catches un-awaited Promises
  surfaced as `Promise<T>` in JSX; CI gate enforces.

## 8. Success criteria

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass; CI green.
- No duplicated tone maps, stat cards, back links, opportunity cards, or raw
  progress-bar divs remain (grep-clean).
- `db.*` is async; zero `db.me()` references outside `lib/session.ts`.
- Every route has a `<title>`; `loading`/`error` boundaries exist for the app group
  and dynamic routes.
- Fonts served via `next/font`; no Google `<link>` in `layout.tsx`.
- Lighthouse a11y ≥ 95 on primary routes; approve sheet fully keyboard-operable.
- Behaviour and visuals unchanged except the approved contrast adjustment.

## 9. Out of scope / next phase

Backend plumbing (Supabase schema + RLS + adversarial tests, Stytch magic-link auth,
tRPC routers replacing `lib/data.ts` bodies, Anthropic conversation/extraction/scoring
services, Inngest workers, Resend emails) — each its own spec → plan cycle, starting
from the seams this pass establishes (`lib/data.ts`, `lib/session.ts`, `lib/schemas.ts`).
