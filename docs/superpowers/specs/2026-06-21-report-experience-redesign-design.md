# Report Experience Redesign — Design Spec

**Date:** 2026-06-21
**Status:** Approved design, ready for implementation plans
**Author:** Fred (brainstormed with Claude)

---

## 1. Summary

The sprint discovery report is the product's headline deliverable — it's what justifies the engagement and drives the sponsor to approve opportunities (→ auto-drafted SOW → Twistag FDE work). Today it's a flat, single-column wall of prose + cards + diagrams with no visual hierarchy: a sponsor skimming can't extract the decision in the first screen, and the new workflow diagrams are visually understated and easy to scroll past.

This redesign reshapes the report into a **sponsor-grade, scannable deliverable** with a hybrid hero (the number + the decision + the sharpest insight on screen one), diagrams **promoted to first-class evidence under plain-English insight headlines**, a **Vercel-style drill-down sidebar** for navigation, and **shareable password-protected links** replacing the PDF/print export.

It is three independently shippable slices, sequenced to deliver the biggest UX win first.

## 2. Goals

1. A sponsor understands "how much is at stake, what to do, and why to believe it" within the first screen.
2. The workflow diagrams become legible, framed insights — not buried keyword boxes.
3. Navigation feels like a modern app (Vercel/Linear): one persistent sidebar that drills into report sections and individual opportunities.
4. A sponsor can share the report as a password-protected link, no login required for recipients.
5. Reuse existing patterns (ReportArticle, WorkflowDiagram from the workflow-maps work, AppSidebar, the audit/RLS conventions). Decompose the oversized `ReportArticle.tsx` as we touch it.

## 3. Non-goals

- Improving diagram **label quality** — that's a function of the synthesis engine's prompts + real `recompute` data, tracked separately. This redesign makes labels *legible and well-framed*; real data makes them *meaningful*. (The placeholder demo-seed labels are not representative.)
- Manager-initiated sharing — sharing is **sponsor-only** (see §4).
- Offline PDF export — explicitly dropped (see §4, §10.3). Flagged tradeoff: managers lose offline export.
- Real-time collaboration, comments, or annotations on the report.

## 4. Decisions (locked in brainstorming)

| Decision | Choice |
|---|---|
| Opening of the report | **Hybrid hero (C)** — number + recommended move + sharpest insight on screen one. |
| Layout | **Cockpit** (two-column / app-like), enabled by dropping the print/PDF constraint. |
| Diagram treatment | Promoted to **first-class evidence under plain-English insight headlines** ("What we found"). |
| Navigation | **Vercel-style drill-down sidebar** reusing the existing `AppSidebar`; nested levels with `‹` back. |
| Export | **Drop PDF/print**; replace with shareable links. |
| Share link scope | **Option C — full report incl. names**, but **password-protected** (sponsor sets the password). |
| Who can share | **Sponsor only.** Managers view in-app but cannot create share links. |
| Share safeguards | Hashed password, hashed token in DB, revocable, rate-limited password attempts, audit-logged creation + access, short-lived view cookie. |
| Primary audience | **Sponsor** (skim → decide); manager secondary (studies detail). |

## 5. Slices & sequencing

Three independent slices, each its own implementation plan, built in order:

1. **Slice 1 — Report content & layout** (the core UX fix). Self-contained; needs neither the sidebar nor sharing to land value. Ships with a slim in-content sticky decision bar.
2. **Slice 2 — Drill-down sidebar.** Generalizes `AppSidebar` to nested levels; moves the decision chip into the drilled sidebar.
3. **Slice 3 — Shareable password links.** New `report_shares` table, public `/r/[token]` route, sponsor management UI, PDF removal.

---

## 6. Slice 1 — Report content & layout

### 6.1 Information architecture (new section order)

1. **Hero** — the lead insight + the decision.
2. **What we found** — 2–3 insight cards (the swimlane/topology workflow maps, promoted).
3. **Opportunities** — impact/effort matrix overview → top-3 elevated → compact ranked table.
4. **How the work flows** — the full diagrams as the detailed/evidence view (for those who scroll).
5. **Roadmap** — quick wins / solid bets / strategic bets, as a sequenced timeline.
6. **What's next** — the SOW ask.

The current "How to read this report" explainer banner is kept but demoted (collapsible, below the hero).

### 6.2 Hero (composition)

- **Headline** — a data-derived sentence framing the money as an insight, e.g. *"€163–314K/yr is sitting in how {tenant} runs {primaryFocus}."* Templated from the top-5 impact range + sprint focus. The synthesis memo's `openingNarrative` (already stored) renders as the supporting sub-line. (A sharper LLM-generated headline is a future engine improvement — out of scope here.)
- **Key metrics row** — opportunities count, high-impact count, total impact range, captures · sessions. Reuse the existing `SprintProgress` data.
- **Recommended first move** — the #1 portfolio opportunity (highest composite among surfaced/portfolio). Shows title, impact range, time-to-ship, evidence count, and an **Approve** action — rendered **only for a signed-in sponsor** (reuse the existing `approveOpportunity` server action + `requireManagerOrSponsor` / `session.role === "sponsor"` gating from `app/(app)/sprint/[id]/opportunity/[oppId]/`). Managers see the recommendation without the Approve button.

### 6.3 "What we found" — insight cards (the diagram fix)

- Each **surfaced** swimlane / systems_topology workflow map (from `loadWorkflowMaps`, Plan 2) renders as an insight card: a **plain-English headline** (the map's `title`) + the `WorkflowDiagram` beneath it as evidence + "Based on N sessions" + an evidence affordance (the contributor name+role quotes, reusing the evidence pattern from `OpportunityDetail`'s evidence tab; click-through stays name+role only).
- The `impact_effort` map is NOT a "finding" — it moves to the head of the Opportunities section as a portfolio overview.
- Honesty primitives carry over from Plan 2: inferred steps dashed, disputed marked.

### 6.4 Opportunities

- **Matrix overview** — the `impact_effort` `WorkflowDiagram` + its numbered legend, as a one-glance portfolio map.
- **Top 3 elevated** — rich cards (score, impact, time-to-ship, category, delivery path, evidence count), each linking to the opportunity detail route.
- **The rest** — a compact ranked table (score · title · impact · category), each row → detail.

### 6.5 Roadmap / What's next

- Roadmap rendered as a horizontal sequenced timeline by horizon (quick_win → standard → strategic_bet), from the existing portfolio/horizon data.
- "What's next" keeps the SOW-path prose.

### 6.6 Components (decompose `ReportArticle.tsx`)

`components/report/ReportArticle.tsx` is currently one large file with a local `Section` helper. Decompose into focused components under `components/report/`:

- `ReportHero.tsx` — hero + metrics + recommended move.
- `FindingsSection.tsx` + `InsightCard.tsx` — the promoted diagrams.
- `OpportunitiesSection.tsx` (matrix overview + `TopOpportunityCard` + `RankedOpportunityTable`).
- `RoadmapTimeline.tsx`.
- `StickyDecisionBar.tsx` — a slim sticky "recommended move + Approve" bar (Slice 1's stand-in for the sidebar chip; removed/migrated in Slice 2).
- `ReportArticle.tsx` stays the composition root.

The report page (`app/(app)/sprint/[id]/report/page.tsx`) keeps fetching via `getApi()` and passes data down; the Twistag read-only admin report reuses the same components.

### 6.7 Slice 1 testing

- Component render tests (jsdom + @testing-library/react) for hero, insight card (diagram present, headline, evidence count), ranked table.
- A test that the Approve action renders only for `role === "sponsor"`.
- Snapshot-light assertions that the section order matches the IA.

---

## 7. Slice 2 — Drill-down sidebar

### 7.1 Behavior (the Vercel pattern)

One persistent sidebar; a nav node with children **drills in** (content slides, `‹ Parent` header to walk back). Levels:

- **Top** (sprint context): Overview · **Report ›** · Participants.
- **Report ›** → Summary · What we found · **Opportunities · N ›** · How the work flows · Roadmap.
- **Opportunities ›** → the N individual opportunities (active = current); each → the existing opportunity detail route.

### 7.2 Model & state

- Extend `components/AppSidebar.tsx` (and `AppShell.tsx`). Today nav items are a flat, stateless, path-based list (`buildPersonas`, `matchScore`). Introduce a **nav-tree** where a node may have `children`, and a small `useState` drill path + slide transition.
- **Drill level is URL-derived where possible** (deep-linkable, matches Vercel): on `/sprint/[id]/report` the sidebar auto-drills to the Report level; on `/sprint/[id]/opportunity/[oppId]` it shows the Opportunities level with the active opp. `‹` navigates to the parent route.
- **Report sections** are scroll anchors with an `IntersectionObserver` scroll-spy that highlights the active section as the user scrolls the report.
- The **decision chip** (recoverable €/yr + Approve top move) lives at the top of the drilled-Report sidebar — migrating the Slice-1 `StickyDecisionBar` here.
- The nested-sidebar primitive is generic (reusable for Twistag admin areas later) — keep it decoupled from report specifics.

### 7.3 Slice 2 testing

- Tests for the nav-tree drill/back transitions and active-state derivation from a given pathname.
- Scroll-spy active-section selection given mocked intersection entries.
- Accessibility: `‹` back is a real button, drilled lists are keyboard-navigable, active item has `aria-current`.

---

## 8. Slice 3 — Shareable password links

### 8.1 Flow

1. **Sponsor** opens the report (signed in) → **Share** action in the toolbar (sponsor-only; replaces the removed "Download PDF").
2. Dialog: set a **password** (+ optional label like "Board deck"), create → returns a URL `/r/{token}`. Sponsor copies it; sees existing links; can **revoke**.
3. A recipient opens `/r/{token}` (no login) → **password gate** → on success, a short-lived signed view-cookie is set and the **read-only** report renders (full report, names included).

### 8.2 Data model — `report_shares`

```
report_shares
  id               uuid pk
  tenant_id        uuid not null  → tenants(id)
  sprint_id        uuid not null  → sprints(id)
  token_hash       text not null unique     -- sha256(urlToken); URL holds the raw token
  password_hash    text not null            -- scrypt: "salt:hash" (node:crypto)
  label            text null
  created_by       uuid not null  → users(id)   -- the sponsor
  created_at       timestamptz not null default now()
  revoked_at       timestamptz null
  last_accessed_at timestamptz null
```

**RLS** (mirrors existing tenant tables): tenant SELECT for the owning tenant + Twistag read; **writes service_role only** (creation/revocation via audited tRPC). The **public access path** reads via `service_role` (the viewer is anonymous) scoped strictly to the matched share's `sprint_id`/`tenant_id`. Adversarial cross-tenant test required. PR touching RLS needs 2 approvals (CLAUDE.md).

### 8.3 Token & password

- **Token:** `crypto.randomBytes(32)` → base64url (URL-safe, unguessable). The DB stores **`token_hash = sha256(token)`**; lookup hashes the incoming URL token (a DB read leak never yields a live link). High-entropy token → fast hash is sufficient.
- **Password:** new `lib/share-password.ts` using `node:crypto` scrypt + `timingSafeEqual` (`hashPassword`/`verifyPassword`, format `salt:hash`). No new dependency. (Fallback if a vetted lib is preferred: `bcryptjs` — pure JS, Vercel-safe.)

### 8.4 Public route `/r/[token]`

- Add `path.startsWith("/r")` to `isPublic()` in `middleware.ts` (mirrors the `/auth` allow-list).
- Route: look up the share by `token_hash` via `service_role`; 404/Gone if missing or `revoked_at` set.
- **Password gate** server action: rate-limited via `lib/rate-limit` (per token + IP); `verifyPassword`; on success set a **short-lived HMAC-signed cookie** scoped to the token (e.g. 24h) so in-report navigation doesn't re-prompt.
- With a valid cookie, render a **public, read-only** report: reuse the Slice-1 report components in a `public`/`readOnly` mode — **no Approve, no app sidebar/drill, no in-app chrome**, a minimal public header. Data is loaded by a dedicated **public report loader** that fetches only that sprint's report payload under `service_role` (sprint, progress, opportunities, memo, surfaced workflow maps with name+role evidence — option C).
- **Audit** every share **creation**, **revocation**, **access success**, and **access failure** via `withServiceRole({ action: "report.share.*", actor, tenantId, targetId, metadata }, …)`.

### 8.5 Sponsor management UI + tRPC

- tRPC procedures, **sponsor-gated** (`session.role === "sponsor"`): `reportShare.create({ sprintId, password, label? })`, `reportShare.list({ sprintId })`, `reportShare.revoke({ id })`. Each runs the service-role write/read audited.
- `components/report/ShareDialog.tsx` (client) — create/list/copy/revoke. The toolbar's "Download PDF" is replaced by a **Share** button rendered only for sponsors.

### 8.6 Remove PDF/print

- Delete the `<PrintButton />` import + render from `app/(app)/sprint/[id]/report/page.tsx`; delete `components/report/PrintButton.tsx`.
- Leave the `[data-print-hide]` / `[data-app-chrome]` CSS in `app/globals.css` (harmless; a browser Cmd+P still produces a clean page) or tidy it — non-blocking.

### 8.7 Slice 3 testing

- Unit: `share-password` hash/verify (correct password verifies, wrong fails, timing-safe), `token_hash` lookup.
- Integration (embedded-postgres): `report_shares` RLS isolation + cross-tenant adversarial (another tenant reads 0); revoked link denies access; the public loader returns only the matched sprint's data.
- Rate-limit on password attempts; audit rows written for create/revoke/access.
- Sponsor-only gating on the tRPC procedures (manager/IC rejected).

---

## 9. Privacy & security (cross-cutting)

- **Option C exposes contributor names** to anyone with link **+ password**. This extends the in-app de-anonymization (2026-06-20, sponsors see name+role) to link-holders. It is an intentional, sponsor-accountable expansion, bounded by: sponsor-only creation, a sponsor-set password (hashed), revocability, rate-limited attempts, audit logging of creation + every access, hashed token at rest, and a short-lived view cookie.
- The public route must leak **nothing** beyond the matched share's sprint report — no tenant enumeration, no other sprints, no email/`userId` (evidence stays **name + role** only, per existing read functions).
- `report_shares` is a security-sensitive new table + public route: **flag the Slice-3 PR for `/security-review`** and the 2-approval RLS rule.
- Removed captures stay excluded from evidence everywhere (existing `isRemoved` filter).

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Public link leaks names broadly | Password + sponsor-only + revocable + rate-limited + audited; option to revoke instantly. |
| Diagram labels still read as generic | Out of scope here (engine/prompt + real recompute); layout makes them legible regardless. |
| `ReportArticle` refactor regresses the existing report | Decompose behind the same data contract; keep the Twistag read-only report rendering the same components; component tests. |
| Two-column cockpit hurts mobile | Single breakpoint: cockpit collapses to single column < md; the drill-down sidebar becomes a top sheet. |
| Managers lose offline export (PDF dropped) | Accepted tradeoff (sponsor-only share). Revisit if managers ask for export. |
| Public route auth bypass / cookie forgery | HMAC-signed view cookie scoped per token; middleware allow-list limited to `/r`; service-role reads scoped to the matched share only. |

## 11. Open questions

- **Headline source:** Slice 1 uses a templated data-derived headline + the memo sub-line. If that reads weak on real sprints, add an LLM-generated `headline` to synthesis (engine change, separate).
- **Insight selection:** which surfaced maps become "What we found" cards vs. live only in the detailed "How the work flows" — default: all surfaced swimlane/topology maps are findings; revisit if there are many.
- **View-cookie lifetime** (default 24h) and **max password attempts** before lockout — tune in Slice 3.
- **Mobile drill-down** exact treatment (sheet vs. overlay) — settle in Slice 2.

## 12. Dependencies / grounding (existing code)

| Concern | Where |
|---|---|
| Report page + data fetch | `app/(app)/sprint/[id]/report/page.tsx` (via `getApi()`) |
| Report body (to decompose) | `components/report/ReportArticle.tsx` (+ local `Section`) |
| Diagrams | `components/workflow/WorkflowDiagram.tsx`, `lib/sprint-read.ts#loadWorkflowMaps` (workflow-maps work) |
| Sidebar | `components/AppSidebar.tsx`, `components/AppShell.tsx` (`buildPersonas`, path-based active) |
| Print/PDF (to remove) | `components/report/PrintButton.tsx`, `app/globals.css` (`[data-print-hide]`) |
| Opportunity detail + approve gating | `app/(app)/sprint/[id]/opportunity/[oppId]/`, `requireManagerOrSponsor`, `session.role` |
| Audit + service-role write | `db/client.ts#withServiceRole`, `audit_log` table |
| Public-route precedent | `app/auth/confirm/`, `middleware.ts#isPublic` |
| RLS + adversarial test pattern | `db/migrations/*`, `db/*.integration.test.ts`, `db/test/helpers.ts` |
| Rate limiting | `lib/rate-limit` |
