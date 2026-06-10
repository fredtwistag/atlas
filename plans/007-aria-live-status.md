# 007 — Announce async status (B7)

**Base commit:** `5eff48f` · **Plan:** B7 · **Category:** A11y · **Risk:** LOW

## Problem
Async results (nudge-sent, launch, conversation typing) have no `aria-live`/`aria-busy`,
so screen readers miss state changes.

## Change
- Nudge-sent card (`components/manager/NudgeComposer.tsx:55-72`): wrap result in
  `aria-live="polite"`; set `aria-busy` on the form/button during pending.
- Launch button (`components/sprint/LaunchSprintForm.tsx`): `aria-busy` during pending,
  polite live region for the result/error.
- Conversation typing indicator (`components/session/ConversationView.tsx:149`):
  `aria-live="polite"` (or mark decorative + announce "Atlas is typing").
Pairs with 004's success confirmation.

## TDD
Light component assertions where practical (e.g. NudgeComposer renders a polite live
region). Otherwise visual + axe check.

## Gate
`npm run build`.
