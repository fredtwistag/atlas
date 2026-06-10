# 006 — ≥44px icon-button hit area (B5)

**Base commit:** `5eff48f` · **Plan:** B5 · **Category:** A11y/Mobile · **Risk:** LOW

## Problem
`p-1.5` (~24px) icon buttons (close/menu/edit) are below the WCAG 2.5.5 (44px) tap target.
Locations: `components/ui/Sheet.tsx`, `components/AppShell.tsx` (mobile menu),
`components/session/EditCaptures.tsx`, `components/session/ConversationView.tsx`.

## Change
Add an icon-button size to `components/ui/Button.tsx` (e.g.
`icon: "h-10 w-10 p-0 grid place-items-center"` — ≥40px; bump to 44 if the design allows)
OR a shared utility class. Apply to the `p-1.5` icon buttons above. Ensure each has an
`aria-label` (add where missing).

## TDD
No strict unit test (visual). Verify in preview at 375px; confirm tap target ≥44px via
inspect.

## Gate
`npm run build` + manual preview at 375px (screenshot).
