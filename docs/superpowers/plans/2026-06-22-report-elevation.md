# Discovery Report Elevation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate the sprint discovery report (`/sprint/[id]/report`) into a credible, answer-first, evidence-backed artifact — without leaving the single-column article paradigm.

**Architecture:** Pull the report's *content logic* (lead phrasing, participation framing, confidence/corroboration, narrative fallback, pull-quote selection, bucket taxonomy) into a new pure module `lib/report-content.ts` with full unit tests, and have `components/report/ReportArticle.tsx` consume it. Presentation-only changes (typography, cards, matrix table, print) are made in the components directly and verified in the browser. The high-impact definition changes from a composite-score cutoff to an impact-magnitude band, threaded through `computeProgress`.

**Tech Stack:** Next.js 15 / React 19 / TypeScript / Tailwind. Tests: Vitest (`npx vitest run <file>`). Visual verification: the `atlas-dev` preview server + the live Vizta report.

**Spec:** `docs/superpowers/specs/2026-06-22-report-elevation-design.md`

**Hard constraints (do not violate):**
- Single-column article only — no cockpit/dashboard/sidebar (that direction was reverted).
- Calibrated numbers, honest voice (CLAUDE.md): no vanity metrics, no banned words ("leverage/unlock/seamless/robust/empower").
- Per-opportunity workflow diagrams stay on the opportunity detail page; only the impact-vs-effort matrix lives on the report.
- The LLM scoring/synthesis boundary receives role + department only — never names. Pull-quotes render names from `Capture.contributorName/Role` in the UI only (allowed since 2026-06-20). No name ever flows into an LLM call.

**Locked decisions:**
- High-impact = estimated annual impact ≥ **€75,000/yr** (on the high estimate). Constant `HIGH_IMPACT_EUR = 75_000`.
- One bucket taxonomy everywhere: **Quick wins / Solid bets / Strategic bets** (maps to the `horizon` field: `quick_win` / `standard` / `strategic_bet`).

**Verification environment (used by every visual task):**
- Preview server is configured as `atlas-dev` in `.claude/launch.json` (Next dev). Start it with the preview tool; do not run `next build` while it runs.
- Report URL: `/sprint/5ad70000-0000-4000-8000-000000000010/report`.
- Auth: open `/sign-in/dev`, submit the persona whose email is `fred+1@twistag.com` (manager · Vizta). The sponsor view uses `vera@vizta.pt`.

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `lib/report-content.ts` | Pure report content logic: band constant, lead phrasing, participation line, corroboration summary, narrative fallback, pull-quote selection, bucket label | Create |
| `lib/report-content.test.ts` | Unit tests for the above | Create |
| `lib/dashboard-map.ts` | `computeProgress` high-impact = impact band | Modify (`:38`) |
| `lib/dashboard-map.test.ts` | Update high-impact expectation | Modify (`:12`,`:22`) |
| `lib/sprint-read.ts` | `loadSprintProgress` selects + passes `impactHigh` | Modify (`:218-234`) |
| `components/report/ReportArticle.tsx` | Consume content helpers; bottom-line block; reorder; quotes; matrix table; roadmap taxonomy; typography | Modify |
| `components/report/ReportExplainer.tsx` | Lighter, collapsible affordance | Modify |
| `components/opportunity/OpportunityCard.tsx` | Declutter badges; anchor score; corroboration | Modify |
| `components/workflow/layout/matrix.ts` | Drop BCG quadrant labels | Modify (`:62-64`) |
| `app/globals.css` | Designed print stylesheet | Modify (`:58`) |

---

## Task 1: Content-logic module foundation

**Files:**
- Create: `lib/report-content.ts`
- Test: `lib/report-content.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import {
  HIGH_IMPACT_EUR,
  countHighImpact,
  highImpactLead,
  participationLine,
  corroborationLine,
  bucketLabel,
} from "./report-content";
import type { Opportunity } from "./types";

function opp(p: Partial<Opportunity>): Opportunity {
  return {
    id: "o", sprintId: "s", title: "T", description: "", category: "Ops",
    departments: [], impactLow: 10_000, impactHigh: 20_000,
    timeToShipWeeksLow: 3, timeToShipWeeksHigh: 5, confidenceScore: 4,
    compositeScore: 6, horizon: "standard", delivery: "build",
    deliveryRationale: "", dimensionScores: [], rationale: "",
    status: "surfaced", evidence: [], contributorCount: 3, ...p,
  };
}

describe("countHighImpact", () => {
  it("counts opps whose high estimate clears the band", () => {
    const opps = [opp({ impactHigh: 90_000 }), opp({ impactHigh: 75_000 }), opp({ impactHigh: 60_000 })];
    expect(countHighImpact(opps)).toBe(2);
  });
});

describe("highImpactLead", () => {
  it("phrases a non-zero count around the money band", () => {
    expect(highImpactLead(9, 3, "EUR")).toBe(
      "9 opportunities, 3 of them estimated at €75K+/yr each",
    );
  });
  it("never leads with a zero — falls back to the count alone", () => {
    expect(highImpactLead(9, 0, "EUR")).toBe("9 opportunities");
  });
  it("uses the singular for one high-impact opportunity", () => {
    expect(highImpactLead(5, 1, "EUR")).toBe(
      "5 opportunities, 1 of them estimated at €75K+/yr",
    );
  });
});

describe("participationLine", () => {
  it("states real n + captures, no vanity percentage", () => {
    expect(participationLine(3, "Transversal", 46)).toBe(
      "3 contributors across Transversal · 46 captures",
    );
  });
});

describe("corroborationLine", () => {
  it("states the minimum corroboration honestly", () => {
    const opps = [opp({ contributorCount: 2 }), opp({ contributorCount: 5 })];
    expect(corroborationLine(opps)).toBe(
      "Every opportunity shown is corroborated by at least two contributors.",
    );
  });
  it("returns empty string when there are no opportunities", () => {
    expect(corroborationLine([])).toBe("");
  });
});

describe("bucketLabel", () => {
  it("maps horizon to the unified taxonomy", () => {
    expect(bucketLabel("quick_win")).toBe("Quick wins");
    expect(bucketLabel("standard")).toBe("Solid bets");
    expect(bucketLabel("strategic_bet")).toBe("Strategic bets");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/report-content.test.ts`
Expected: FAIL — `Cannot find module './report-content'`.

- [ ] **Step 3: Implement `lib/report-content.ts`**

```ts
import { moneyShort, type Currency } from "./format";
import type { Horizon, Opportunity } from "./types";

/** High-impact = estimated annual impact at/above this band (on the high
 *  estimate). Single source of truth, imported by dashboard-map's progress. */
export const HIGH_IMPACT_EUR = 75_000;

/** How many opportunities clear the impact band. */
export function countHighImpact(opps: Pick<Opportunity, "impactHigh">[]): number {
  return opps.filter((o) => o.impactHigh >= HIGH_IMPACT_EUR).length;
}

/**
 * The executive-summary lead clause. Anchors high-impact to money, and NEVER
 * leads with a zero — when the count is 0 it returns the bare opportunity count
 * so the caller phrases the lead around the top opportunity instead.
 */
export function highImpactLead(
  opportunitiesCount: number,
  highImpactCount: number,
  currency: Currency,
): string {
  const opps = `${opportunitiesCount} opportunit${opportunitiesCount === 1 ? "y" : "ies"}`;
  if (highImpactCount <= 0) return opps;
  const band = moneyShort(HIGH_IMPACT_EUR, currency);
  const each = highImpactCount === 1 ? "" : " each";
  return `${opps}, ${highImpactCount} of them estimated at ${band}+/yr${each}`;
}

/** Honest participation framing — real n + coverage, no vanity percentage. */
export function participationLine(
  participantCount: number,
  scopeDepartment: string,
  capturesCount: number,
): string {
  return `${participantCount} contributor${participantCount === 1 ? "" : "s"} across ${scopeDepartment} · ${capturesCount} captures`;
}

/** One honest confidence sentence (the shown set is corroborated by ≥2). */
export function corroborationLine(opps: Opportunity[]): string {
  if (opps.length === 0) return "";
  return "Every opportunity shown is corroborated by at least two contributors.";
}

const BUCKET: Record<Horizon, string> = {
  quick_win: "Quick wins",
  standard: "Solid bets",
  strategic_bet: "Strategic bets",
};

/** Unified bucket taxonomy used by both the roadmap and the matrix table. */
export function bucketLabel(horizon: Horizon): string {
  return BUCKET[horizon];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/report-content.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/report-content.ts lib/report-content.test.ts
git commit -m "feat(report): content-logic module — impact band, lead phrasing, taxonomy"
```

---

## Task 2: High-impact = impact-magnitude band (Tier 0.1 plumbing)

**Files:**
- Modify: `lib/dashboard-map.ts:9-43`
- Modify: `lib/dashboard-map.test.ts:6-25`
- Modify: `lib/sprint-read.ts:218-234`

- [ ] **Step 1: Update the failing test in `lib/dashboard-map.test.ts`**

Replace the `opportunities` input and the high-impact assertion (the function now needs `impactHigh`):

```ts
      opportunities: [
        { compositeScore: 8.7, impactHigh: 90_000 },
        { compositeScore: 6.1, impactHigh: 40_000 },
      ],
```
and
```ts
    expect(p.highImpactCount).toBe(1); // only the €90K opp clears the €75K band
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/dashboard-map.test.ts`
Expected: FAIL — `computeProgress` still filters by `compositeScore >= 7.5` and the input type rejects `impactHigh`.

- [ ] **Step 3: Update `computeProgress` in `lib/dashboard-map.ts`**

Add the import at the top:
```ts
import { HIGH_IMPACT_EUR } from "./report-content";
```
Change the `opportunities` arg type (line ~15) from `{ compositeScore: number }[]` to:
```ts
  opportunities: { compositeScore: number; impactHigh: number }[];
```
Change the `highImpactCount` line (`:38`) to:
```ts
    highImpactCount: args.opportunities.filter(
      (o) => o.impactHigh >= HIGH_IMPACT_EUR,
    ).length,
```

- [ ] **Step 4: Thread `impactHigh` through `loadSprintProgress` in `lib/sprint-read.ts`**

In the `opps` select (`:218`):
```ts
  const opps = await tx
    .select({
      compositeScore: opportunities.compositeScore,
      impactHigh: opportunities.impactHigh,
    })
    .from(opportunities)
    .where(eq(opportunities.sprintId, id));
```
In the `computeProgress` call (`:229`):
```ts
    opportunities: opps.map((o) => ({
      compositeScore: Number(o.compositeScore),
      impactHigh: Number(o.impactHigh),
    })),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/dashboard-map.test.ts lib/report-content.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck the touched data path**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/dashboard-map.ts lib/dashboard-map.test.ts lib/sprint-read.ts
git commit -m "feat(report): high-impact = €75K/yr impact band, not composite cutoff"
```

---

## Task 3: Honest exec summary — lead, participation, confidence (Tier 0.1/0.2/0.3)

**Files:**
- Modify: `components/report/ReportArticle.tsx:100-139`

- [ ] **Step 1: Rewrite the Executive summary section**

Add imports at the top of the file:
```ts
import {
  highImpactLead,
  participationLine,
  corroborationLine,
} from "@/lib/report-content";
```

Replace the prose + stat grid (`:101-139`) with:
```tsx
      <Section title="Executive summary">
        <p>
          Over {sprint.dayTotal} days, Atlas held short, structured
          conversations with {p.participantCount} contributor
          {p.participantCount === 1 ? "" : "s"} across {sprint.scopeDepartment} —{" "}
          {p.sessionsCompleted} sessions producing {p.capturesCount} discrete
          captures. From those, Atlas surfaced{" "}
          <strong>{highImpactLead(p.opportunitiesCount, p.highImpactCount, currency)}</strong>.
        </p>
        <p>
          The combined estimated annual impact of the top five is{" "}
          <strong>
            {moneyShort(totalLow, currency)}–{moneyShort(totalHigh, currency)}
          </strong>
          .{" "}
          {topFive[0] ? (
            <>
              The highest-ranked — <strong>{topFive[0].title}</strong> — is
              estimated at {moneyShort(topFive[0].impactLow, currency)}–
              {moneyShort(topFive[0].impactHigh, currency)}/yr.
            </>
          ) : null}{" "}
          {corroborationLine(opps)}
        </p>
        <div className="my-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            [`${moneyShort(totalLow, currency)}+`, "Est. impact, top 5"],
            [`${p.opportunitiesCount}`, "Opportunities"],
            [`${p.capturesCount}`, "Captures"],
          ].map(([v, l]) => (
            <div
              key={l}
              className="rounded-lg border border-border bg-surface p-4 text-center"
            >
              <div className="text-3xl font-semibold tracking-tight">{v}</div>
              <div className="mt-1 text-xs text-text-3">{l}</div>
            </div>
          ))}
        </div>
      </Section>
```
(The misleading "100% Participation" stat is gone; `participationLine` is available if you prefer it as a sub-caption — not required here since the prose now carries the honest framing. `grid-cols-1 sm:grid-cols-3` fixes the mobile cramping from Tier 3.2.)

- [ ] **Step 2: Verify in the browser**

Start `atlas-dev`, sign in as `fred+1@twistag.com`, open the report URL. Confirm:
- The lead reads "…surfaced 9 opportunities, 3 of them estimated at €75K+/yr each." (no "0 high-impact").
- No "100%" anywhere; stat cards read "Est. impact, top 5 / Opportunities / Captures".
- The corroboration sentence renders.
Take a screenshot for the record.

- [ ] **Step 3: Commit**

```bash
git add components/report/ReportArticle.tsx
git commit -m "feat(report): honest exec summary — money-anchored lead, real n, corroboration"
```

---

## Task 4: Always-on synthesis narrative (Tier 1.2)

**Files:**
- Modify: `lib/report-content.ts` (add `narrativeFallback`)
- Modify: `lib/report-content.test.ts` (add tests)
- Modify: `components/report/ReportArticle.tsx:84-98`

- [ ] **Step 1: Write the failing test**

```ts
import { narrativeFallback } from "./report-content";

describe("narrativeFallback", () => {
  it("builds a 2-sentence spine from the top opportunities", () => {
    const opps = [
      opp({ title: "Automate takeoff", impactLow: 56_000, impactHigh: 90_000 }),
      opp({ title: "Map ingestion", impactLow: 56_000, impactHigh: 75_000 }),
    ];
    const text = narrativeFallback({
      scopeDepartment: "Transversal",
      participantCount: 3,
      opportunitiesCount: 9,
      opps,
      totalLow: 178_000,
      totalHigh: 317_000,
      currency: "EUR",
    });
    expect(text).toContain("9 opportunities");
    expect(text).toContain("Automate takeoff");
    expect(text).toContain("€178K–€317K");
  });
  it("returns empty string when there are no opportunities", () => {
    expect(
      narrativeFallback({
        scopeDepartment: "X", participantCount: 0, opportunitiesCount: 0,
        opps: [], totalLow: 0, totalHigh: 0, currency: "EUR",
      }),
    ).toBe("");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/report-content.test.ts`
Expected: FAIL — `narrativeFallback` not exported.

- [ ] **Step 3: Implement `narrativeFallback` in `lib/report-content.ts`**

```ts
import { moneyRange } from "./format";

export function narrativeFallback(args: {
  scopeDepartment: string;
  participantCount: number;
  opportunitiesCount: number;
  opps: Opportunity[];
  totalLow: number;
  totalHigh: number;
  currency: Currency;
}): string {
  const { opps, currency } = args;
  if (opps.length === 0) return "";
  const top = opps[0];
  return (
    `Across ${args.scopeDepartment}, ${args.participantCount} contributor` +
    `${args.participantCount === 1 ? "" : "s"} surfaced ${args.opportunitiesCount} ` +
    `opportunit${args.opportunitiesCount === 1 ? "y" : "ies"}. The strongest — ` +
    `${top.title} — is estimated at ${moneyRange(top.impactLow, top.impactHigh, currency)}/yr; ` +
    `together the top five represent ${moneyRange(args.totalLow, args.totalHigh, currency)}/yr ` +
    `in recurring impact.`
  );
}
```
(Add `moneyRange` to the existing `./format` import.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/report-content.test.ts`
Expected: PASS.

- [ ] **Step 5: Make the Synthesis section always render in `ReportArticle.tsx`**

Add the import and replace the memo block (`:84-98`):
```ts
import { narrativeFallback } from "@/lib/report-content";
```
```tsx
      {/* Synthesis — the board-ready spine. Uses the generated memo when
          present, else a deterministic fallback so it never silently vanishes. */}
      <Section title="Synthesis">
        {memo && memo.openingNarrative ? (
          <>
            <p>{memo.openingNarrative}</p>
            {memo.portfolioStory ? <p>{memo.portfolioStory}</p> : null}
            {memo.sequencingLogic ? <p>{memo.sequencingLogic}</p> : null}
            {memo.riskNarrative ? <p>{memo.riskNarrative}</p> : null}
            {memo.recommendedNextStep ? (
              <p>
                <strong>Recommended next step. </strong>
                {memo.recommendedNextStep}
              </p>
            ) : null}
          </>
        ) : (
          <p>
            {narrativeFallback({
              scopeDepartment: sprint.scopeDepartment,
              participantCount: p.participantCount,
              opportunitiesCount: p.opportunitiesCount,
              opps,
              totalLow,
              totalHigh,
              currency,
            })}
          </p>
        )}
      </Section>
```

- [ ] **Step 6: Verify in the browser**

Reload the Vizta report (its memo is empty). Confirm a "Synthesis" section now appears with the fallback narrative naming the top opportunity and the €178K–€317K total.

- [ ] **Step 7: Commit**

```bash
git add lib/report-content.ts lib/report-content.test.ts components/report/ReportArticle.tsx
git commit -m "feat(report): always-on synthesis narrative with deterministic fallback"
```

---

## Task 5: Bottom-line-up-front block (Tier 1.1)

**Files:**
- Modify: `components/report/ReportArticle.tsx` (new block after the cover `<header>`, before Synthesis)

- [ ] **Step 1: Add the bottom-line block**

Immediately after the cover `</header>` (`:82`), insert:
```tsx
      {/* Bottom line — the answer first. What to approve, the return, the ask. */}
      {topFive.length > 0 ? (
        <div className="mb-12 rounded-xl border border-brand/30 bg-surface p-6">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-brand">
            Bottom line
          </div>
          <p className="text-lg leading-relaxed text-text">
            Start with <strong>{topFive[0].title}</strong>
            {topFive[1] ? (
              <> and <strong>{topFive[1].title}</strong></>
            ) : null}
            . The top five represent{" "}
            <strong>
              {moneyShort(totalLow, currency)}–{moneyShort(totalHigh, currency)}/yr
            </strong>{" "}
            in estimated recurring impact. Approve one and Twistag aligns scope
            within 48 hours.
          </p>
        </div>
      ) : null}
```

- [ ] **Step 2: Verify in the browser**

Reload the report. Confirm the "Bottom line" block sits directly under the cover, names the top one or two opportunities, the combined range, and the 48h ask — readable on the first screen.

- [ ] **Step 3: Commit**

```bash
git add components/report/ReportArticle.tsx
git commit -m "feat(report): bottom-line-up-front block after the cover"
```

---

## Task 6: Demote methodology (Tier 1.3)

**Files:**
- Modify: `components/report/ReportArticle.tsx` (move + condense the "How we got here" section)

- [ ] **Step 1: Move and condense the methodology**

Cut the entire `<Section title="How we got here">…</Section>` block (`:142-158`) from its current position (between Executive summary and Opportunities) and re-insert it **after** the "Suggested roadmap" section and **before** "What happens next". Condense to a single paragraph:
```tsx
      {/* Methodology — moved below the payoff; condensed to one paragraph. */}
      <Section title="How we got here">
        <p>
          Atlas runs discovery as conversation, not workshops: each participant
          completed up to four short sessions on their own schedule. An
          extraction pass lifted concrete moments — bottlenecks, workarounds,
          handoffs — attributed to the contributor by name and role, then
          clustered and scored across five dimensions (financial impact,
          feasibility, time to value, strategic alignment, evidence
          confidence). Only opportunities corroborated by more than one
          contributor are shown; each links back to its verbatim captures.
        </p>
      </Section>
```

- [ ] **Step 2: Verify in the browser**

Reload. Confirm the section order is now: Cover → Bottom line → Synthesis → Executive summary → Opportunities, ranked → Impact vs. effort → Suggested roadmap → How we got here → What happens next.

- [ ] **Step 3: Commit**

```bash
git add components/report/ReportArticle.tsx
git commit -m "feat(report): demote and condense methodology below the payoff"
```

---

## Task 7: Put corroborated voices on the page (Tier 1.4)

**Files:**
- Modify: `lib/report-content.ts` (add `selectPullQuotes`)
- Modify: `lib/report-content.test.ts` (add tests)
- Modify: `components/report/ReportArticle.tsx` (render a pull-quote in the exec summary)

- [ ] **Step 1: Write the failing test**

```ts
import { selectPullQuotes } from "./report-content";

describe("selectPullQuotes", () => {
  const cap = (q: string, removed = false, edited = false) => ({
    id: q, kind: "bottleneck" as const, summary: "s", sourceQuote: q,
    contributorName: "Ana", contributorRole: "Controller",
    tags: [], isRemoved: removed, isEdited: edited,
  });
  it("takes verbatim, attributed quotes from the top opps, skipping removed/edited", () => {
    const opps = [
      opp({ title: "A", contributorCount: 4, evidence: [cap("real quote here")] }),
      opp({ title: "B", contributorCount: 2, evidence: [cap("removed", true), cap("edited", false, true)] }),
    ];
    const out = selectPullQuotes(opps, 2);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      quote: "real quote here", name: "Ana", role: "Controller",
      oppTitle: "A", corroboration: 4,
    });
  });
  it("returns [] when nothing qualifies", () => {
    expect(selectPullQuotes([opp({ evidence: [] })], 2)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/report-content.test.ts`
Expected: FAIL — `selectPullQuotes` not exported.

- [ ] **Step 3: Implement `selectPullQuotes`**

```ts
import type { Capture } from "./types";

export type PullQuote = {
  quote: string;
  name: string;
  role: string;
  oppTitle: string;
  corroboration: number;
};

/**
 * Pick up to `n` verbatim, attributed quotes from the highest-ranked
 * opportunities, skipping removed/edited captures and de-duping identical
 * quotes. `opps` is assumed already rank-ordered. Names render in the UI only.
 */
export function selectPullQuotes(opps: Opportunity[], n: number): PullQuote[] {
  const out: PullQuote[] = [];
  const seen = new Set<string>();
  for (const o of opps) {
    for (const c of o.evidence as Capture[]) {
      if (out.length >= n) return out;
      if (c.isRemoved || c.isEdited) continue;
      const q = (c.sourceQuote ?? "").trim();
      if (!q || !c.contributorName || seen.has(q)) continue;
      seen.add(q);
      out.push({
        quote: q,
        name: c.contributorName,
        role: c.contributorRole,
        oppTitle: o.title,
        corroboration: o.contributorCount,
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/report-content.test.ts`
Expected: PASS.

- [ ] **Step 5: Render one pull-quote in the exec summary**

Add the import and, inside the Executive summary `<Section>` (after the closing stat-grid `</div>`), render the first quote:
```ts
import { selectPullQuotes } from "@/lib/report-content";
```
```tsx
        {(() => {
          const [pq] = selectPullQuotes(opps, 1);
          return pq ? (
            <figure className="my-6 border-l-2 border-brand pl-4">
              <blockquote className="text-lg italic leading-relaxed text-text">
                “{pq.quote}”
              </blockquote>
              <figcaption className="mt-2 text-sm text-text-3">
                {pq.name}, {pq.role}
                {pq.corroboration > 1
                  ? ` · echoed by ${pq.corroboration - 1} other${pq.corroboration - 1 === 1 ? "" : "s"}`
                  : ""}
              </figcaption>
            </figure>
          ) : null;
        })()}
```

- [ ] **Step 6: Verify in the browser**

Reload. Confirm a real attributed quote (name + role) renders in the executive summary with an "echoed by N others" tag, and that it is a genuine Vizta capture (not placeholder text).

- [ ] **Step 7: Commit**

```bash
git add lib/report-content.ts lib/report-content.test.ts components/report/ReportArticle.tsx
git commit -m "feat(report): corroborated pull-quote (name + role) in the exec summary"
```

---

## Task 8: Legible, accessible, coherent matrix + roadmap (Tier 2.1)

**Files:**
- Modify: `components/workflow/layout/matrix.ts:60-64`
- Modify: `components/report/ReportArticle.tsx` (matrix legend → labeled table; roadmap taxonomy)

- [ ] **Step 1: Drop the BCG quadrant labels in `matrix.ts`**

Remove the three positional region labels (`:62-64`: "Quick wins", "Big bets", "Deprioritize") so the matrix introduces no competing vocabulary. Keep the axis labels ("Higher impact" `:60`, "Higher effort" `:61`). After the edit the labels array contains only the two axis labels.

- [ ] **Step 2: Replace the numbered legend with a labeled, accessible table in `ReportArticle.tsx`**

In the "Impact vs. effort" section, replace the `<ol>` legend (`:205-213`) with a table that labels each point directly and carries the unified bucket taxonomy. Add the import:
```ts
import { bucketLabel } from "@/lib/report-content";
```
```tsx
                {m.kind === "impact_effort" ? (
                  <table className="mt-4 w-full text-left text-sm">
                    <caption className="sr-only">
                      Opportunities by estimated impact, effort, and bucket
                    </caption>
                    <thead>
                      <tr className="text-xs text-text-3">
                        <th scope="col" className="py-1 pr-3 font-medium">#</th>
                        <th scope="col" className="py-1 pr-3 font-medium">Opportunity</th>
                        <th scope="col" className="py-1 pr-3 font-medium">Bucket</th>
                      </tr>
                    </thead>
                    <tbody>
                      {opps.map((o, i) => (
                        <tr key={o.id} className="border-t border-border">
                          <td className="py-1.5 pr-3 text-text-3">{i + 1}</td>
                          <td className="py-1.5 pr-3 text-text-2">{o.title}</td>
                          <td className="py-1.5 pr-3 text-text-2">{bucketLabel(o.horizon)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
```
(The table draws from `opps` in rank order — the point numbers `1..n` match the matrix dot order produced by `buildImpactEffort`, which maps `opps` in order. This removes the lookup cross-reference and gives screen readers a real equivalent.)

- [ ] **Step 3: Unify the roadmap taxonomy in `ReportArticle.tsx`**

The roadmap already uses "Quick wins / Solid bets / Strategic bets" (`:223-240`), which matches `bucketLabel`. Confirm the three `RoadmapColumn` titles read exactly `Quick wins`, `Solid bets`, `Strategic bets` and leave the captions. No vocabulary change needed here — the reconciliation was the matrix dropping its BCG labels (Step 1) and the table speaking the same buckets (Step 2).

- [ ] **Step 4: Verify in the browser + a11y spot check**

Reload. Confirm: the matrix no longer prints "Big bets / Deprioritize"; below it a table lists each opportunity with its bucket; the matrix, table, and roadmap all use the same three bucket words. With the keyboard, Tab through and confirm the table is reachable and readable; the `<caption class="sr-only">` describes it.

- [ ] **Step 5: Commit**

```bash
git add components/workflow/layout/matrix.ts components/report/ReportArticle.tsx
git commit -m "feat(report): legible+accessible matrix table; one bucket taxonomy across matrix+roadmap"
```

---

## Task 9: Declutter opportunity cards + anchor the score (Tier 2.2)

**Files:**
- Modify: `components/opportunity/OpportunityCard.tsx:53-75`

- [ ] **Step 1: Reduce the badge row to a primary pair + demote the rest**

Rework the badge block so impact and time-to-ship are the clear primary pair, and category/horizon/delivery are demoted to a single muted meta line. Replace the `<div className="mt-2 flex flex-wrap …">…</div>` (`:53-75`) with:
```tsx
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone="success">
              {moneyRange(opp.impactLow, opp.impactHigh, currency)}/yr
            </Badge>
            <Badge tone="outline">
              {opp.timeToShipWeeksLow}–{opp.timeToShipWeeksHigh} wks
            </Badge>
          </div>
          <p className="mt-1.5 text-xs text-text-3">
            {meta === "category" ? opp.category : `${opp.contributorCount} voices`}
            {horizonMeta[opp.horizon] ? ` · ${horizonMeta[opp.horizon]!.label}` : ""}
            {deliveryMeta[opp.delivery] ? ` · ${deliveryMeta[opp.delivery]!.label}` : ""}
            {` · corroborated by ${opp.contributorCount}`}
          </p>
```
(Impact + time stay as prominent badges; category, horizon, delivery, and corroboration collapse into one quiet meta line — surfacing the Tier 0.3 corroboration on every card.)

- [ ] **Step 2: Anchor the composite score**

The `ScoreBadge` currently shows a bare number. Add a non-color textual anchor so the score is interpretable and not color-only (also satisfies Tier 3.2). In `components/ScoreBadge.tsx`, add a `title`/`aria-label` of the form `Composite score {score} of 10` to the badge's root element. (Read the file first; add the attribute to the existing root `<span>`/`<div>` without changing layout.)

- [ ] **Step 3: Verify in the browser**

Reload the report. Confirm each ranked card shows impact + weeks as the dominant badges, a single quiet meta line (category · horizon/delivery · corroborated by N), and the score badge exposes "… of 10" on hover/SR. Confirm the dashboard (`/sprint/<id>`) cards, which use `meta="voices"`, still render correctly.

- [ ] **Step 4: Commit**

```bash
git add components/opportunity/OpportunityCard.tsx components/ScoreBadge.tsx
git commit -m "feat(report): declutter opportunity cards; anchor composite score; show corroboration"
```

---

## Task 10: Editorial hierarchy (Tier 2.3)

**Files:**
- Modify: `components/report/ReportArticle.tsx` (cover thesis + date; section numbering)

- [ ] **Step 1: Add a thesis line + generated date to the cover**

In the cover `<header>` (`:54-82`), after the meta row `</div>` (`:81`), add a one-line thesis and the generated date:
```tsx
        <p className="mt-6 max-w-prose text-lg leading-relaxed text-text">
          {topFive[0]
            ? `The fastest path to recurring savings in ${sprint.scopeDepartment}: ${p.opportunitiesCount} ranked opportunities, evidenced by your own team.`
            : `Discovery findings for ${sprint.scopeDepartment}.`}
        </p>
        <p className="mt-3 text-xs text-text-3">
          Generated {sprint.endDate} · Built by Twistag
        </p>
```
(Honest, calibrated, no banned words. Avoid promising a number that isn't true.)

- [ ] **Step 2: Add lightweight section numbering for rhythm**

Update the `Section` helper (`:262-277`) to accept an optional `index` and render it as a muted prefix, giving the page a report-like cadence without changing the single-column layout:
```tsx
function Section({
  title,
  index,
  children,
}: {
  title: string;
  index?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-2xl font-semibold tracking-tight">
        {index != null ? (
          <span className="mr-2 text-text-3">{String(index).padStart(2, "0")}</span>
        ) : null}
        {title}
      </h2>
      <div className="space-y-3 text-md leading-relaxed text-text-2 [&_strong]:font-semibold [&_strong]:text-text">
        {children}
      </div>
    </section>
  );
}
```
Pass sequential `index` props to the main content sections (Synthesis=1, Executive summary=2, Opportunities=3, Impact vs. effort=4, Suggested roadmap=5, How we got here=6, What happens next=7). Leave the Bottom-line block unnumbered.

- [ ] **Step 3: Verify in the browser**

Reload. Confirm the cover carries a thesis line + generated date, and sections show "01 … 02 …" prefixes. The page should read with clear rhythm, still single-column, no dashboard widgets.

- [ ] **Step 4: Commit**

```bash
git add components/report/ReportArticle.tsx
git commit -m "feat(report): editorial hierarchy — cover thesis, generated date, section numbering"
```

---

## Task 11: Lighten the explainer (Tier 2.4)

**Files:**
- Modify: `components/report/ReportExplainer.tsx`

- [ ] **Step 1: Convert the full card to a collapsible details affordance**

Replace the `<Card>` body (`:29-51`) with a compact `<details>` that defaults closed, so it no longer occupies the prime first-screen slot. Keep the dismiss/localStorage behavior intact and `data-print-hide`:
```tsx
  return (
    <details
      data-print-hide
      className="mb-8 rounded-lg border border-border bg-surface px-4 py-3 text-sm [&_summary]:cursor-pointer"
    >
      <summary className="flex items-center justify-between gap-2 font-medium">
        <span>How to read this report</span>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); dismiss(); }}
          aria-label="Dismiss"
          className="rounded p-1 text-text-3 hover:bg-surface-2 hover:text-text"
        >
          <X className="h-4 w-4" />
        </button>
      </summary>
      <p className="mt-2 leading-relaxed text-text-2">
        Each opportunity is scored across five dimensions — financial impact,
        implementation feasibility, time to value, strategic alignment, and
        evidence confidence — and only those corroborated by more than one
        contributor are shown. The composite score (0–10) ranks them.
      </p>
      <p className="mt-2 leading-relaxed text-text-2">
        Expect 5–10 opportunities surfaced, 1–3 of them high-impact. Approving
        one hands it to the Twistag engagement team with a pre-drafted scope, so
        the build can start within days.
      </p>
    </details>
  );
```

- [ ] **Step 2: Verify in the browser**

Reload (clear `localStorage` key `atlas:report-explainer:v1` if previously dismissed). Confirm the explainer is now a single collapsed line at the top that expands on click, dismiss still works and persists, and it is hidden in print.

- [ ] **Step 3: Commit**

```bash
git add components/report/ReportExplainer.tsx
git commit -m "feat(report): lighten the explainer into a collapsible affordance"
```

---

## Task 12: Designed PDF / print stylesheet (Tier 3.1)

**Files:**
- Modify: `app/globals.css:58-70`

- [ ] **Step 1: Extend the print block**

Replace the existing `@media print { … }` block (`:58-70`) with a designed-document version: page margins + numbers, keep the matrix/figures from clipping, avoid orphaned headings:
```css
@media print {
  [data-app-chrome],
  [data-print-hide] {
    display: none !important;
  }
  main,
  article {
    max-width: none !important;
  }
  @page {
    margin: 18mm 16mm;
  }
  /* Keep figures, cards, and the matrix from splitting across pages. */
  figure,
  table,
  .not-prose > * {
    break-inside: avoid;
  }
  h1, h2, h3 {
    break-after: avoid;
  }
  /* The cover starts its own page; sections flow after. */
  header {
    break-after: page;
  }
}
```

- [ ] **Step 2: Verify the print output**

With the report open in the preview, trigger print preview (the "Download PDF" button calls `window.print`; in the preview tooling use the browser's print emulation). Confirm: the cover is its own page, the impact/effort figure and table are not clipped mid-page, headings don't strand at page bottoms, and app chrome/toolbar/explainer are hidden.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat(report): designed print stylesheet — cover page, no clipped figures"
```

---

## Task 13: Final responsive + a11y + content-rule guard (Tier 3.2)

**Files:**
- Modify: `lib/report-content.test.ts` (content-rule regression tests)
- Verify: `components/report/ReportArticle.tsx` (responsive grids, tap targets)

- [ ] **Step 1: Add content-rule regression tests**

These lock the credibility fixes so they can't silently regress. Append to `lib/report-content.test.ts`:
```ts
describe("content-rule guards", () => {
  it("the lead never emits a bare '0 high-impact' clause", () => {
    expect(highImpactLead(9, 0, "EUR")).not.toContain("0 of them");
    expect(highImpactLead(9, 0, "EUR")).not.toContain("high-impact");
  });
  it("participation framing never emits a vanity 100%", () => {
    expect(participationLine(3, "Transversal", 46)).not.toContain("%");
  });
});
```

- [ ] **Step 2: Run to verify they pass**

Run: `npx vitest run lib/report-content.test.ts`
Expected: PASS.

- [ ] **Step 3: Confirm responsive grids + tap targets**

In `ReportArticle.tsx`, confirm the exec stat grid uses `grid-cols-1 sm:grid-cols-3` (set in Task 3) and the roadmap uses `sm:grid-cols-3` (already present). Resize the preview to a narrow width (≈390px) and confirm the stat cards stack, the matrix table scrolls/fits, and nothing overflows horizontally. Confirm the linked opportunity cards present a tap target ≥44px tall.

- [ ] **Step 4: Full verification sweep**

Stop the `atlas-dev` dev server first (do not build while it runs). Then:
Run: `npx vitest run lib/` and `npx tsc --noEmit`
Expected: all green. (A full `npm run verify` also runs lint + integration + build; run it if time permits, but the dev server must be stopped.)

- [ ] **Step 5: Final browser pass across variants**

Restart the preview and confirm the full report renders correctly for: the manager view (`fred+1@twistag.com`), the sponsor view (`vera@vizta.pt`, shows "Sponsor view"), and the empty-state (a sprint with no opportunities — the lead, bottom-line, synthesis, and quote blocks must degrade gracefully to nothing rather than error).

- [ ] **Step 6: Commit**

```bash
git add lib/report-content.test.ts
git commit -m "test(report): lock credibility content rules (no zero lead, no vanity %)"
```

---

## Self-review notes (author)

- **Spec coverage:** Tier 0.1 → Tasks 1–3; 0.2 → Task 3; 0.3 → Tasks 1 (corroborationLine) + 9 (per-card); 1.1 → Task 5; 1.2 → Task 4; 1.3 → Task 6; 1.4 → Task 7; 2.1 → Task 8; 2.2 → Task 9; 2.3 → Task 10; 2.4 → Task 11; 3.1 → Task 12; 3.2 → Tasks 3 (grid) + 9 (score cue) + 13. All spec items map to a task.
- **Type consistency:** `HIGH_IMPACT_EUR`, `bucketLabel`, `highImpactLead`, `participationLine`, `corroborationLine`, `narrativeFallback`, `selectPullQuotes`/`PullQuote` are defined in Task 1/4/7 and consumed with matching signatures in later tasks.
- **Known follow-up:** the €75K band cutoff should be sanity-checked against 1–2 more real sprints once available (spec decision 0.1); the constant lives in one place (`lib/report-content.ts`) for easy tuning.
