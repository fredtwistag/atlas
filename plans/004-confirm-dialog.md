# 004 — Accessible ConfirmDialog (B3)

**Base commit:** `5eff48f` · **Plan:** B3 · **Category:** UX/A11y · **Risk:** MED

## Problem
Member-remove and sprint-close use native `window.confirm()` — off-brand, unstyled, weak
SR support, no toast feedback. `components/manager/MemberRow.tsx:96`,
`components/sprint/CloseSprintButton.tsx:24`.

## Change
Build `components/ui/ConfirmDialog.tsx` modeled on the focus-trapping
`components/ui/Sheet.tsx` (reuse Escape handling + `previouslyFocused` restore pattern):
- `role="alertdialog"`, `aria-labelledby` + `aria-describedby`
- autofocus the **non-destructive** (Cancel) button
- danger-styled confirm button using the `--danger` token
- props: `open`, `title`, `description`, `confirmLabel`, `cancelLabel`, `onConfirm`,
  `onCancel`, `destructive`, optional `pending`

Wire into `MemberRow.tsx` and `CloseSprintButton.tsx`. Keep the exact existing copy
("…sessions are deleted too. This can't be undone."). On success, surface a transient
confirmation (pairs with 007 aria-live).

## TDD
`components/ui/ConfirmDialog.test.tsx` (Testing Library): renders when open, Escape closes
(calls onCancel), focus starts on Cancel, clicking confirm fires `onConfirm`. Watch fail first.

## Gate
`npm test` + preview.
