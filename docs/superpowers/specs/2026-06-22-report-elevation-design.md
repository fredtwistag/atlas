# Discovery Report Elevation — Design Spec

> **Date:** 2026-06-22 · **Status:** Approved direction, pending spec review
> **Scope:** UX + content-strategy uplift of the sprint discovery report (`/sprint/[id]/report`)
> **Origin:** Simulated review panel (2 Metalab senior product designers, 2 Bain senior partners) against the live Vizta report.

---

## Context

The discovery report is the product's headline artifact: the ranked, ROI-scored opportunity backlog a sponsor approves and forwards to their board / IC / PE deal team. It is rendered by `components/report/ReportArticle.tsx`, shared by the manager/sponsor route (`app/(app)/sprint/[id]/report`) and the Twistag admin read-only route.

A panel reviewed the live Vizta report end-to-end. The verdict: **honest and clean, but it argues weakly and hides its best evidence.** It leads with a self-defeating number, trumpets a vanity percentage, buries the recommendation under methodology, and — despite Atlas's whole pitch being *real voices attributed by name and role* — shows zero quotes on the page.

### Hard constraints (do not violate)

1. **Single-column article paradigm only.** A cockpit-layout report + drill-down sidebar were built and reverted on 2026-06-22 (`9225f82`) because Fred disliked both. This work elevates *within* the article — typographic craft, IA, and content — **never** a dashboard, widget wall, or sidebar.
2. **Calibrated numbers / honest voice** (CLAUDE.md style guide). No vanity metrics, no "12 opportunities, 3 high-impact" math that doesn't hold. No "leverage / unlock / seamless / robust." Keep lines like *"Nothing here is a slide — it's a backlog ready to execute."*
3. **Per-opportunity workflow diagrams stay on the opportunity detail page** (pivot of 2026-06-22). Only the impact-vs-effort matrix lives at report level. Don't move diagrams back to the report.
4. **The LLM scoring/synthesis boundary receives role + department only — never names.** Pull-quotes render names in the *UI* (allowed since the 2026-06-20 de-anonymization) from `Capture.contributorName/Role`; this is presentation, not an LLM input change.

### Optimization target

Sponsor and manager **equally**. Sponsor = decision-maker who approves and forwards (credibility, ROI framing, board consumption). Manager = champion who must understand and socialize findings.

### Resolved calls

- **Matrix: keep + fix.** Retain one portfolio visual but make it legible and accessible, and make it tell the same story as the roadmap.
- **ROI: one honest anchor line.** Add a single editorial sentence anchoring recurring impact with a confidence band tied to corroboration. **Do not** fabricate engagement cost / payback / multiple we can't stand behind. No finance dashboard.

---

## Goals / Non-goals

**Goals**
- Lead with the answer (bottom-line-up-front), not the method.
- Put real, corroborated voices on the report page.
- Make every headline number true and calibrated.
- Make the portfolio visual legible, accessible, and coherent with the roadmap.
- Make the forwarded PDF the best-looking version of the report, not the worst.

**Non-goals**
- No new layout paradigm (no cockpit/sidebar/widgets).
- No change to the scoring engine's inputs/boundary (threshold calibration is a display/derivation tweak, see 0.1).
- No moving per-opportunity diagrams back onto the report.
- No new data pipelines — required data already reaches the page (see Data availability).

---

## Data availability (verified)

| Need | Source | Status |
|---|---|---|
| Verbatim quotes + name + role | `Opportunity.evidence: Capture[]` → `sourceQuote`, `contributorName`, `contributorRole`, `summary`, `kind` | Already on the page |
| Corroboration count ("echoed by N") | `Opportunity.contributorCount` | Already on the page |
| Confidence cue | `Opportunity.confidenceScore` (1–5) + `dimensionScores` (incl. evidence confidence) | Already on the page |
| Participation truth | `SprintProgress.participantCount / sessionsCompleted / sessionsTotal / capturesCount` | Already on the page |
| High-impact count | `SprintProgress.highImpactCount`, derived `compositeScore >= 7.5` at `lib/dashboard-map.ts:38` | Needs recalibration (0.1) |
| Board narrative | `SynthesisMemo` (optional; empty on Vizta → "Synthesis" section silently absent) | Needs always-on fallback (1.2) |
| Matrix | `services/synthesis/workflows/impact-effort.ts` (`buildImpactEffort`) rendered via `WorkflowDiagram` | Needs render-side fix (2.1) |

---

## Design — four tiers, sequenced by leverage-to-effort

### Tier 0 — Truth in numbers *(cheapest, highest credibility ROI)*

**0.1 — Never lead with a zero.** The `compositeScore >= 7.5` high-impact threshold (`lib/dashboard-map.ts:38`) is absolute, so a portfolio whose top opp is 6.9 always reports "0 high-impact" in the lead sentence. Recalibrate to a portfolio-aware definition (e.g. top-quartile composite, or impact-magnitude based, or a lower fixed bar validated against real sprints). If the honest count is genuinely 0, the exec-summary lead reframes around the strength of the #1 opportunity rather than the absence of high-impact ones.
- *Acceptance:* The exec summary never renders "0 ... high-impact" as a lead clause; `highImpactCount` reflects a defensible, documented definition; existing dashboard/report consumers of `highImpactCount` stay consistent.

**0.2 — Honest participation.** Replace the standalone "100% Participation" stat (misleading at n=3) with calibrated framing, e.g. `3 of 3 invited · 6 directorates · 46 captures`. Drop the vanity percent from the stat grid; keep depth signals (captures, directorates).
- *Acceptance:* No bare "100%" participation figure; the summary states the real n and coverage; reads as depth, not breadth.

**0.3 — Surface confidence.** Add a corroboration/confidence cue at summary level and per opportunity ("corroborated by N voices" / confidence band), drawn from `contributorCount` + `confidenceScore`.
- *Acceptance:* Each ranked opportunity shows a corroboration signal; the summary carries one confidence statement.

### Tier 1 — Argue first, then evidence *(narrative & IA)*

**1.1 — Bottom-line block** immediately after the cover: the 1–2 opportunities to approve first, the combined recurring impact with confidence band (the single honest ROI line), and the ask ("approve → Twistag scopes within 48h"). This is the BLUF the report currently lacks.
- *Acceptance:* A reader who stops after the first screen knows what to approve, the expected return, the confidence, and the next action.

**1.2 — Always-on synthesis narrative.** The "Synthesis" section currently renders only if `memo.openingNarrative` exists, so the board-ready argument can silently vanish (it does on Vizta). Guarantee a narrative spine with a strong deterministic fallback assembled from the top opportunities + portfolio shape when the memo is empty.
- *Acceptance:* The report always has a narrative section; never a silent gap.

**1.3 — Demote methodology.** Condense "How we got here" to a tight paragraph and move it below the opportunities (or into a footnote-style appendix). Payoff before process.
- *Acceptance:* Methodology no longer sits above the ranked opportunities.

**1.4 — Put voices on the page.** Insert 1–2 verbatim pull-quotes (name + role, from `evidence[].sourceQuote`) into the exec summary and/or at the head of the top opportunities, each tagged with corroboration ("echoed by N others") so a quote reads as a data point, not an anecdote. Pull from real, non-removed, non-edited captures.
- *Acceptance:* At least one corroborated, attributed verbatim quote appears on the report body; respects `isRemoved`/`isEdited`; no email/userId exposed.

### Tier 2 — Information design *(craft)*

**2.1 — Fix the portfolio visual (keep + fix).** Make the impact/effort matrix legible: label points directly (drop the numbered lookup-legend cross-reference), add an accessible table equivalent, and reconcile its vocabulary and story with the roadmap. The matrix quadrants currently read "Quick wins / Big bets / Deprioritize" while the roadmap columns read "Quick wins / Solid bets / Strategic bets" — unify to one taxonomy. Ensure the matrix's point cluster doesn't contradict a roadmap that promises "Quick wins."
- *Acceptance:* No legend cross-referencing required to read the matrix; a screen-reader table equivalent exists; one shared taxonomy across matrix + roadmap; the two visuals tell the same story.

**2.2 — Declutter opportunity cards.** Cards currently show five badges (€, wks, category, horizon, delivery). Establish a primary pair (impact + time-to-ship) with visual emphasis; demote/consolidate horizon, delivery, category. Anchor or relabel the bare composite score ("6.9" → labeled scale or clearer signal).
- *Acceptance:* Primary metrics are visually dominant; the score is interpretable without prior knowledge; cards scan in <2s.

**2.3 — Editorial hierarchy.** Add a cover thesis line + generated date; introduce section rhythm (numbering or scale), a "key takeaway" treatment, and real pull-quote styling. Magazine, not dashboard.
- *Acceptance:* Sections have differentiated weight; the cover carries a one-line thesis + date; the page reads as a crafted report.

**2.4 — Lighten the explainer.** Turn the top-of-page "How to read this report" card into a lighter inline/collapsible affordance so it stops pushing real content down on every visit.
- *Acceptance:* The explainer no longer occupies the prime first-screen slot as a full card.

### Tier 3 — The artifact & the long tail

**3.1 — Designed PDF/print stylesheet.** "Download PDF" is `window.print`. Craft the print path: cover page, page numbers, footer, and a matrix that isn't clipped — the forwarded version should be the best-looking one.
- *Acceptance:* Printing produces a deliberately laid-out document; no clipped visuals; page furniture present.

**3.2 — Responsive + a11y.** Fix the fixed `grid-cols-3` exec stat grid on mobile; matrix table equivalent (from 2.1); non-color cue for the score; contrast pass on `text-text-3`; 44px tap targets on interactive cards.
- *Acceptance:* Usable at mobile widths; passes a contrast/keyboard/SR spot-check.

---

## Components touched (anticipated)

- `components/report/ReportArticle.tsx` — exec summary, stat grid, bottom-line block, synthesis fallback, methodology placement, pull-quotes, matrix/roadmap reconciliation, editorial hierarchy.
- `components/report/ReportExplainer.tsx` — lighten (2.4).
- `components/opportunity/OpportunityCard.tsx` — declutter + score anchor (2.2).
- `components/workflow/WorkflowDiagram.tsx` (+ `services/synthesis/workflows/impact-effort.ts` only if labels must change at build) — matrix legibility + a11y table (2.1).
- `lib/dashboard-map.ts` — high-impact threshold recalibration (0.1).
- Print stylesheet / `PrintButton` path (3.1).
- Both report routes inherit changes via `ReportArticle`; verify the Twistag read-only route (no `opportunityHref`) still renders correctly.

## Testing

- Update/extend `lib/report-coverage.ts` + tests for new content rules (no "0 high-impact" lead; participation framing; presence of a narrative section and ≥1 corroborated quote).
- Visual verification on the live Vizta report (populated), the empty-state report, the sponsor view, and the Twistag read-only route.
- Print/PDF verification.
- a11y spot-check (contrast, keyboard, SR table for the matrix).

## Open questions

- **0.1:** Preferred high-impact definition — top-quartile composite, impact-magnitude band, or a recalibrated fixed bar? (Recommend: documented impact-magnitude band, validated against real sprints; falls out of scoring, not vanity.)
- **2.1:** Final unified taxonomy label set for matrix + roadmap (Quick wins / Solid bets / Strategic bets vs. Quick wins / Big bets / Deprioritize).
