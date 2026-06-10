# Manager Experience v1 — design spec

**Date:** 2026-06-10
**Status:** Approved-by-delegation (user: "I trust you — plan and execute")
**Owner:** fred@twistag.com
**Source:** live browser simulation of all manager journeys (this session).
**Builds on:** P1 + P2 (on main).

---

## 1. Goal

Make the manager — the app's most important role — feel like a polished command
center: land in the right place, every entity clickable to somewhere useful,
every action obvious, no dead buttons, fully responsive. Linear/Vanta/Cowork-level
clarity.

## 2. Findings from the simulation (what's wrong today)

1. **Wrong landing.** After sign-in, manager/sponsor land on `/team` (the invite
   page), not the dashboard. `nextFor()` in `app/sign-in/dev/page.tsx` returns
   `/team` for manager/sponsor; the magic-link callback defaults to `/me`.
2. **Dead team rows.** On the dashboard, only `idle`/`not_started` contributors
   have an action ("Send nudge"); the other rows aren't clickable — a manager
   can't open a contributor or nudge an active/complete one.
3. **Dead "Download PDF".** The report toolbar button has no handler.
4. **Cramped on mobile.** The team-progress table is a 4-column table squeezed
   into 375px. (Stat cards, opportunity cards, and column reflow are fine.)
5. **Static stat cards.** Participation / Opportunities / etc. aren't actionable.

Good already (leave alone): the dashboard stat strip, opportunity cards (fully
clickable, ranked), the approve→SOW flow, mobile column reflow.

## 3. Scope — five improvements

### 3.1 Role-aware landing (command center)
- New `lib/landing.ts`: `landingPathFor(s: { kind: string; role?: string }): string`
  → twistag → `/admin`; manager|sponsor → `/sprint`; else `/me`.
- `app/sign-in/dev/page.tsx` uses `landingPathFor` instead of the local `nextFor`
  (manager/sponsor now land on `/sprint`, which redirects to the active dashboard
  or the launch form).
- `app/auth/callback/route.ts`: when `next` is absent/default, resolve the
  signed-in session's claims and redirect via `landingPathFor` (so real magic-link
  sign-in also lands managers on the dashboard).

### 3.2 Participant detail page + clickable team rows
- New page `app/(app)/sprint/[id]/participant/[participantId]/page.tsx`
  (`requireManagerOrSponsor`): the participant's name, role/title, status badge,
  last-active, a **per-session checklist** (their topics with done/pending), and
  the **nudge composer** inline.
- Extend `sprint.participant` (managerProcedure) to also return the participant's
  sessions: `{ name, title, status, sessionsCompleted, sessionsTotal, lastActiveLabel,
  sessions: { topicTitle, status }[] }`. RLS-scoped; cross-tenant → NOT_FOUND.
- Dashboard **team rows become fully clickable** → the participant page (the whole
  row is a link). The inline "Send nudge →" affordance stays for idle/not-started
  as a fast path, but every contributor is now reachable.
- `app/(app)/sprint/[id]/nudge/[participantId]` → redirect to the new participant
  page (keep the route working; the composer now lives on the participant page).

### 3.3 Report "Download PDF" → print
- Extract a client `components/report/PrintButton.tsx` (`onClick={() => window.print()}`).
- Use it in `app/(app)/sprint/[id]/report/page.tsx` toolbar (replaces the dead button).
- Add `@media print` rules (in `app/globals.css`) to hide the app nav rail / mobile
  top bar / the report's own sticky toolbar, so the printed/saved PDF is the clean
  report article only. Gate chrome with a `data-print-hide` attribute or class.

### 3.4 Responsive team progress (mobile cards)
- The dashboard "Team progress" renders as the current table on `lg+`, and as
  **stacked cards** on mobile (avatar, name + dept, progress bar + X/Y, status
  badge, action). Implement as one component with `hidden lg:block` table +
  `lg:hidden` card list (same data, no duplication of logic — map once).
- Both variants link the row/card to the participant page (3.2).

### 3.5 Polish — clickable stat cards (light)
- `StatCard` gains an optional `href`. On the dashboard: Participation → `/team`,
  Opportunities → the report. Quiet affordance (hover), not loud. Skip if it
  complicates the component; this is the lowest-priority item.

## 4. Components / files

- Create: `lib/landing.ts` (+ `lib/landing.test.ts`).
- Create: `app/(app)/sprint/[id]/participant/[participantId]/page.tsx`.
- Create: `components/manager/TeamProgress.tsx` (responsive table+cards; extracted
  from the dashboard page).
- Create: `components/report/PrintButton.tsx`.
- Modify: `app/sign-in/dev/page.tsx` (use `landingPathFor`).
- Modify: `app/auth/callback/route.ts` (role-aware default landing).
- Modify: `server/trpc/routers/sprint.ts` (`participant` returns sessions).
- Modify: `app/(app)/sprint/[id]/page.tsx` (use `<TeamProgress>`; rows link out).
- Modify: `app/(app)/sprint/[id]/nudge/[participantId]/page.tsx` (redirect to participant).
- Modify: `app/(app)/sprint/[id]/report/page.tsx` (`<PrintButton>`).
- Modify: `app/globals.css` (print styles).
- Modify (opt): `components/ui/StatCard.tsx` (+ optional `href`); dashboard wiring.
- Modify: `server/trpc/router.integration.test.ts` (participant sessions tests).

## 5. Testing

- **Unit:** `landingPathFor` (each role → path).
- **Integration:** `sprint.participant` returns the per-session breakdown; IC
  rejected; cross-tenant → NOT_FOUND (extend existing tests).
- **Browser (all manager journeys):** land on dashboard after sign-in; click any
  team row → participant page with progress + nudge; report "Download PDF" opens
  the print dialog with chrome hidden; mobile dashboard shows team cards (no
  cramped table); approve flow still works.
- Existing gate (unit + integration + build) stays green.

## 6. Out of scope / next

Sprint editing/closing; real nudge *sending* (email/Inngest phase); a real
server-side PDF (print-to-PDF is the v1); participant detail for Twistag; deeper
analytics on the dashboard.
