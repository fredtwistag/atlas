# 008 — Tablet reflow + stat breakpoints (C6a/C6b)

**Base commit:** `5eff48f` · **Plan:** C6a/C6b · **Category:** Responsive · **Risk:** MED

## Problem
`lg:grid-cols-[1fr_320px]` hides the right rail at 768–1024px with no reflow; stat grids
jump `sm:grid-cols-2 → lg:grid-cols-4` skipping `md:`.

## Change
- **C6a:** In `components/opportunity/OpportunityDetail.tsx` and
  `app/(app)/sprint/[id]/page.tsx`, make the sidebar **stack below** content single-column
  from `md` down, beside only at `lg+`. Verify score breakdown + approve button reachable
  at 768px.
- **C6b:** Smooth stat-card rows in `app/(app)/sprint/[id]/page.tsx` and
  `app/(app)/twistag/page.tsx` — add `md:grid-cols-3` (or keep 2) between
  `sm:grid-cols-2` and `lg:grid-cols-4`.
- **C-session-height:** Confirm `ConversationView.tsx:108`
  (`h-[calc(100vh-3.5rem)] lg:h-screen`) behaves with the mobile virtual keyboard; prefer
  `dvh` units if testing shows clipping.

## TDD
Visual/responsive. No unit test required.

## Gate
`npm run build` + preview at 375 / 768 / 1280, screenshot each.
