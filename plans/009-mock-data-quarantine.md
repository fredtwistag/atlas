# 009 — Quarantine mock data (D8)

**Base commit:** `5eff48f` · **Plan:** D8 · **Category:** Tech debt · **Risk:** MED

## Problem
Shipped routes still import value helpers/mock from `@/lib/data`:
`app/(app)/sprint/[id]/report/page.tsx:7`, `.../opportunity/[oppId]/page.tsx:4`,
`components/opportunity/OpportunityCard.tsx`, `OpportunityDetail.tsx`,
`components/session/ConversationView.tsx:10`.

## Change
For each `@/lib/data` import in a shipped route/component:
- Move pure formatters (`usdRange`, `usdShort`) to a real `lib/format.ts`.
- SOW helpers likely already covered by `lib/sow.ts` — prefer it.
- Anything genuinely demo-only → move behind a clearly named `lib/demo-data.ts`.
Goal: no shipped page imports `lib/data.ts` for values that should come from tRPC.
Update all importers; keep behavior identical.

## TDD
Co-locate `lib/format.test.ts` for moved formatters (usdRange/usdShort edge cases). Watch
fail first (new module).

## Gate
`npm run typecheck` + `npm run build`; grep confirms no real-route `@/lib/data` imports
remain for moved helpers.
