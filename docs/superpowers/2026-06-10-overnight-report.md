# Overnight work report — 2026-06-10

**Owner while you slept:** Claude. **Branch:** all work on **local `main`** (`54738a6`).
**origin/main:** still `cf93bc6` — **NOT pushed** (see "Needs your call" below).

---

## TL;DR

Built **P1** (4 items) and the safe parts of **P2**, re-audited every role in the
browser after each, and fixed every flaw I found. Final gate green: **34 unit +
58 integration tests, lint clean, production build compiles all 13 routes.**
Nothing was pushed to origin or deployed — you approve that in the morning.

---

## What shipped to local `main`

### P1 — plumbing (spec: `docs/superpowers/specs/2026-06-09-p1-plumbing-design.md`)
- **H1 — auth gating.** New `lib/auth-guards.ts` (`requireTenantSession`,
  `requireManagerOrSponsor`, `requireTwistagSession`). Applied to `/me`,
  `/sprint/[id]`, report, opportunity, nudge, **and `/twistag`**. Non-tenant/IC
  users now **redirect instead of 500**, and ICs can no longer load the manager
  dashboard/report.
- **H2 — approve → SOW persisted.** New `sow_drafts` table (migration `0004`,
  full RLS + adversarial test) + `opportunities.approved_at/by`. New
  `opportunity.approve` mutation (manager/sponsor) writes the SOW + flips status;
  `lib/sow.ts buildSowDraft` generates it; the "Send to Twistag" button now
  persists. The cockpit's **"Approved" count is real** (verified 0 → 1).
- **H3 — nudge page** on real data via `sprint.participant`.
- **H4 — capture-edit page** on real data via `session.editView` (owner-scoped;
  captures empty until the LLM slice — but the page no longer 404s).

### P2 — the safe, no-decision fixes
- **L1 — sponsor attribution.** `sprint.get` now resolves sponsor/manager from the
  `users` table, not just participants. Report shows **"Dana Whitfield, COO"**
  again (was wrongly an IC). (Background chip `task_a6b1d026` is now resolved.)
- **M1 — dead links.** Killed every stale `spr-northwind-q2` link: the **sidebar**
  now uses the tenant's real sprint id (threaded layout → AppShell → AppSidebar)
  and only links real routes; **marketing/pricing/not-found** CTAs now point to
  `/sign-in`.

### Bonus flaw found + fixed during re-audit
- **`/twistag` had no role guard** — a tenant user clicking the "Twistag" persona
  switcher hit a 500. Now guarded (manager → `/me`). Verified both directions.

## Verification (browser, all 6 personas)
- twistag → `/me` redirects to `/admin` (no 500); IC → `/sprint/[id]` redirects to `/me`.
- Approve persists across a full reload; cockpit "Approved" = 1.
- Nudge page renders the real participant; edit page renders the real session.
- Report sponsor = Dana Whitfield, COO. Sidebar links resolve (no stale slug). Layout intact.
- twistag user still gets the cockpit (2 client rows); manager → `/twistag` → `/me`.

## Commits on local `main` (ahead of origin)
```
54738a6 fix(auth): guard /twistag — redirect non-twistag users instead of 500
68a4fb3 Merge P2: sponsor attribution + sidebar/marketing dead-link cleanup
b28dded fix(nav): real sprint-id sidebar links + kill stale dead links
a45439e fix(sprint): resolve sponsor/manager from users table
a02694c Merge P1: auth gating + approve/SOW persistence + nudge/edit on real data
… (P1 task commits)
```
Migration `0004` was applied to the Supabase **dev** DB.

---

## Needs your call (didn't do without you)

1. **Push `origin/main` + deploy.** Held back on purpose: P1 adds a new **RLS
   table (`sow_drafts`)**, which per CLAUDE.md needs **2 engineer approvals**, and
   pushing `main` may trigger a Vercel deploy. Review the diff, then
   `git push origin main`. Migration `0004` will also need running on prod.
2. **`.env.local`** on this machine now has `DATABASE_URL` (6543) + `DIRECT_URL`
   (5432) from the P0 pooling fix. **Prod/Vercel env must be updated the same way**
   before deploy (DATABASE_URL → transaction pooler 6543, add DIRECT_URL, optional
   `DB_POOL_MAX=1`).

## Not done — needs decisions or keys (the "next phases")
- **P2 leftovers (need a product decision):** Twistag cockpit **client drill-in**
  (ATL-504, new route + UI), a **distinct sponsor journey** (today sponsor == manager
  view), `/admin` org drill-in, and the cockpit's decorative sidebar counts.
- **Phase 3 (blocked on keys/decisions):** LLM capture-extraction + real SOW
  generation (needs `ANTHROPIC_API_KEY`); invitation/nudge emails (needs Inngest +
  `RESEND_API_KEY`); capture edit/remove persistence (depends on real captures).

## Known dev-only noise (not a bug)
- `__webpack_require__.n is not a function` in `app/(app)/error.tsx` appears in the
  **dev** React error-overlay during Fast Refresh. Server logs are clean and the
  production build compiles fine — it does not occur in prod. Pre-existing (seen
  before any of tonight's work). Clears on `.next` removal + restart.
