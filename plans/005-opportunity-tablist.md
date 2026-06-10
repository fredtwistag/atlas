# 005 — Opportunity tabs → real tablist (B4)

**Base commit:** `5eff48f` · **Plan:** B4 · **Category:** A11y · **Risk:** LOW

## Problem
`components/opportunity/OpportunityDetail.tsx:138-160` renders tabs as plain buttons — no
`role=tablist`, `aria-selected`, or arrow-key navigation.

## Change
- Parent: `role="tablist"`
- Each button: `role="tab"`, `aria-selected`, `aria-controls={panelId}`, `id={tabId}`
- Panels: `role="tabpanel"`, `id={panelId}`, `aria-labelledby={tabId}`
- Roving `tabIndex`: selected tab `0`, others `-1`
- Left/Right arrow keys move selection (wrap around); Home/End optional
Keep existing visual classes.

## TDD
Extend `components/opportunity/OpportunityDetail.test.tsx`: arrow key moves selection;
`aria-selected` tracks the active tab. Watch fail first.

## Gate
`npm test`.

## Maintenance
This tablist becomes the canonical pattern — review future tabs against it.
