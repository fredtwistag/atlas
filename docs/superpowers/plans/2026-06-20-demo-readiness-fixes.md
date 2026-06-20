# Atlas Demo-Readiness Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Atlas sponsor report + opportunity views demo-ready for the Vizta (Portuguese / EUR) pilot in 2 days by fixing the empty roadmap, switching display + scoring to EUR, removing hardcoded report fiction, and clearing small visible polish bugs.

**Architecture:** All changes are localized to the report/opportunity render layer, the money formatter, the scorer prompt, and session completion — no DB schema migration. Currency is handled the "fastest" way the operator chose: the single money formatter defaults to EUR (global), the scorer prompt + loaded-rate basis switch to EUR, and Vizta's opportunities are re-computed once so stored numbers are EUR-anchored. (Per-tenant currency is a documented post-demo follow-up; today only Vizta and the throwaway Northwind demo tenant exist.)

**Tech Stack:** Next.js 15 / React 19 / TypeScript, tRPC + Zod, Drizzle, Vitest. Conversation/opportunity engine in `services/`, render in `components/`, money formatting in `lib/format.ts`.

**Context from the 2026-06-20 dogfood:** the full loop works end-to-end (46 captures → 8 opportunities → 4 surfaced on Vizta). These fixes address what the dogfood exposed as not demo-ready. See memory `engine-demo-findings`. The `dimensionScores` schema crash is already fixed (committed separately).

**Verification gate for every task:** `npm run typecheck && npx vitest run <touched dirs>` must pass; UI tasks additionally verified in the running preview (`localhost:3000`) signed in as Vera (sponsor) on `/sprint/5ad70000-0000-4000-8000-000000000010/report`.

---

## File Structure

- `lib/format.ts` — rename `usdShort`/`usdRange` → `moneyShort`/`moneyRange` with a `currency` arg defaulting to `"EUR"`. Single money-formatting chokepoint.
- `lib/format.test.ts` — currency cases.
- `components/report/ReportArticle.tsx` — add a third "standard" roadmap column; replace hardcoded Northwind exec-summary sentence with data-driven copy; soften the over-claimed corroboration line.
- `components/opportunity/OpportunityCard.tsx`, `components/opportunity/OpportunityDetail.tsx`, `components/manager/PilotPortfolio.tsx` — switch to `moneyRange`/`moneyShort`; fix "1 contributors" pluralization.
- `lib/text.ts` (new) — tiny `pluralize` helper + test.
- `services/opportunity/score.ts` — scorer prompt + loaded-rate basis → EUR.
- `services/synthesis/portfolio.ts` — narrative money formatting → EUR symbol.
- `server/trpc/routers/opportunity.ts` — dedupe evidence by normalized source quote at read time.
- `lib/sessions.ts` — dedupe final-extraction captures by source quote too; set `lastActiveLabel` on completion.

---

## Task 1: EUR money formatter

**Files:**
- Modify: `lib/format.ts`
- Test: `lib/format.test.ts`

- [ ] **Step 1: Write the failing test**

Replace the body of `lib/format.test.ts` with:

```typescript
import { describe, it, expect } from "vitest";
import { moneyShort, moneyRange } from "./format";

describe("moneyShort", () => {
  it("formats EUR by default", () => {
    expect(moneyShort(28_000)).toBe("€28K");
    expect(moneyShort(1_500_000)).toBe("€1.5M");
    expect(moneyShort(900)).toBe("€900");
  });
  it("honors an explicit currency", () => {
    expect(moneyShort(28_000, "USD")).toBe("$28K");
  });
});

describe("moneyRange", () => {
  it("formats an EUR range", () => {
    expect(moneyRange(28_000, 65_000)).toBe("€28K–€65K");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/format.test.ts`
Expected: FAIL — `moneyShort`/`moneyRange` are not exported.

- [ ] **Step 3: Implement**

Replace the body of `lib/format.ts` with:

```typescript
/**
 * Compact money formatters for impact figures. Pure and server-safe — no mock
 * data dependency. Defaults to EUR (Wave-1 pilots are EUR); pass `currency` to
 * override. Per-tenant currency is a post-demo follow-up.
 */
type Currency = "EUR" | "USD";

const SYMBOL: Record<Currency, string> = { EUR: "€", USD: "$" };

export function moneyShort(n: number, currency: Currency = "EUR"): string {
  const s = SYMBOL[currency];
  if (n >= 1_000_000)
    return `${s}${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${s}${Math.round(n / 1_000)}K`;
  return `${s}${n}`;
}

export function moneyRange(
  low: number,
  high: number,
  currency: Currency = "EUR",
): string {
  return `${moneyShort(low, currency)}–${moneyShort(high, currency)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/format.test.ts`
Expected: PASS (5 assertions).

- [ ] **Step 5: Commit**

```bash
git add lib/format.ts lib/format.test.ts
git commit -m "feat(format): EUR-default money formatter (moneyShort/moneyRange)"
```

---

## Task 2: Point all importers at the EUR formatter

**Files:**
- Modify: `components/opportunity/OpportunityCard.tsx:6,53`
- Modify: `components/opportunity/OpportunityDetail.tsx:23,370`
- Modify: `components/manager/PilotPortfolio.tsx:4` (+ its `usdRange` call)
- Modify: `components/report/ReportArticle.tsx:4,98,108`

- [ ] **Step 1: Update OpportunityCard**

In `components/opportunity/OpportunityCard.tsx` change the import (line 6) and the call (line 53):

```typescript
import { moneyRange } from "@/lib/format";
```
```typescript
              {moneyRange(opp.impactLow, opp.impactHigh)}/yr
```

- [ ] **Step 2: Update OpportunityDetail**

In `components/opportunity/OpportunityDetail.tsx` change the import (line 23):

```typescript
import { moneyRange, moneyShort } from "@/lib/format";
```
Then update every `usdRange(` → `moneyRange(` and `usdShort(` → `moneyShort(` in that file (the SOW price line 370 included).

- [ ] **Step 3: Update PilotPortfolio**

In `components/manager/PilotPortfolio.tsx` change the import (line 4) to `import { moneyRange } from "@/lib/format";` and update its `usdRange(` call to `moneyRange(`.

- [ ] **Step 4: Update ReportArticle**

In `components/report/ReportArticle.tsx` change the import (line 4) to `import { moneyShort } from "@/lib/format";` and update the three `usdShort(` calls (lines 98, 108) to `moneyShort(`.

- [ ] **Step 5: Verify compile + tests**

Run: `npm run typecheck && npx vitest run components lib`
Expected: PASS, no remaining references to `usdShort`/`usdRange` (`grep -rn "usdShort\|usdRange" components app lib services` returns nothing outside this commit's history).

- [ ] **Step 6: Commit**

```bash
git add components lib
git commit -m "refactor: use EUR money formatter across report + opportunity views"
```

---

## Task 3: EUR basis in the scorer + portfolio narrative

**Files:**
- Modify: `services/opportunity/score.ts:62-78,164-177,180-212`
- Modify: `services/synthesis/portfolio.ts:150`

- [ ] **Step 1: Switch the loaded-rate basis to EUR**

In `services/opportunity/score.ts` rename the constant and update its uses (the value 75 stays — a conservative blended EUR loaded rate is fine for the pilot):

```typescript
/** Fallback loaded hourly rate (EUR) when a sprint has no cost basis (EXT-2). */
export const DEFAULT_LOADED_HOURLY_EUR = 75;
```
Update `rateForRole` (line 78) and `costBasisNote` (line 170) to reference `DEFAULT_LOADED_HOURLY_EUR`, and change the strings "loaded hourly rates, USD" → "loaded hourly rates, EUR" and `$${DEFAULT_LOADED_HOURLY_EUR}/hr` → `€${DEFAULT_LOADED_HOURLY_EUR}/hr`. In the implied-annual line (line 267) change `$` → `€`.

- [ ] **Step 2: Switch the scorer output instruction to EUR**

In `scoringSystem()` (line ~192) change:

```typescript
    "- impactLow / impactHigh: estimated annual EUR impact range (integers,",
```

- [ ] **Step 3: Switch the portfolio narrative figures to EUR**

In `services/synthesis/portfolio.ts:150` change the two `$` to `€`:

```typescript
        `- ${it.title} (${it.horizon}, €${it.impactLow.toLocaleString("en-US")}–€${it.impactHigh.toLocaleString("en-US")}/yr)`,
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npx vitest run services/opportunity services/synthesis`
Expected: PASS (any test asserting the old constant name must be updated to `DEFAULT_LOADED_HOURLY_EUR`).

- [ ] **Step 5: Commit**

```bash
git add services/opportunity/score.ts services/synthesis/portfolio.ts
git commit -m "feat(engine): EUR basis in scorer prompt + portfolio narrative"
```

- [ ] **Step 6: Re-anchor Vizta's numbers**

Re-run recompute so stored impacts reflect the EUR instruction (engine entry `recompute(sprintId, actor)`):

Run: `npx tsx --tsconfig scripts/tsconfig.json --env-file=.env.local -e "import('@/services/opportunity/recompute').then(m=>m.recompute('5ad70000-0000-4000-8000-000000000010','demo-eur').then(r=>{console.log(JSON.stringify(r));process.exit(0)}))"`
Expected: JSON with `inserted`/`updated` ≥ 8, `surfaced` ≥ 1. (No commit — this writes DB rows, not code.)

---

## Task 4: Add a "standard" roadmap column (never-empty roadmap)

**Files:**
- Modify: `components/report/ReportArticle.tsx:36-37,162-177`

- [ ] **Step 1: Compute the standard bucket**

In `ReportArticle` after line 37 (`const strategicBets = …`) add:

```typescript
  const solidBets = opps.filter(
    (o) => o.horizon !== "quick_win" && o.horizon !== "strategic_bet",
  );
```

- [ ] **Step 2: Render three columns**

Replace the roadmap `<Section>` (lines 162-177) with a three-up grid that includes the standard bucket:

```tsx
      {/* Roadmap */}
      <Section title="Suggested roadmap">
        <div className="not-prose grid gap-4 sm:grid-cols-3">
          <RoadmapColumn
            title="Quick wins"
            caption="Fast, standalone, low-disruption"
            items={quickWins.map((o) => o.title)}
            empty="No quick wins yet — short-cycle fixes land here as they surface."
          />
          <RoadmapColumn
            title="Solid bets"
            caption="Clear value, standard delivery"
            items={solidBets.map((o) => o.title)}
            empty="Ranked opportunities land here as they surface."
          />
          <RoadmapColumn
            title="Strategic bets"
            caption="High impact, bigger lift"
            items={strategicBets.map((o) => o.title)}
            empty="No strategic bets yet — larger, higher-impact plays land here."
          />
        </div>
      </Section>
```

- [ ] **Step 3: Verify in the preview**

Reload `/sprint/5ad70000-0000-4000-8000-000000000010/report` as Vera. Expected: the middle "Solid bets" column lists the 8 ranked opportunities (none are quick_win/strategic_bet in the current data), so the roadmap is no longer empty.

- [ ] **Step 4: Commit**

```bash
git add components/report/ReportArticle.tsx
git commit -m "fix(report): show standard-horizon opportunities in roadmap (never-empty)"
```

---

## Task 5: Remove hardcoded exec-summary fiction + over-claimed copy

**Files:**
- Modify: `components/report/ReportArticle.tsx:95-103,131-136`

- [ ] **Step 1: Replace the fabricated second exec-summary sentence with data-driven copy**

Replace the second `<p>` of the Executive summary (lines 95-103, the "credit-hold release … five contributors across Finance, Order Ops, and Warehouse" sentence) with:

```tsx
        <p>
          The combined estimated annual impact of the top five is{" "}
          <strong>
            {moneyShort(totalLow)}–{moneyShort(totalHigh)}
          </strong>
          .{" "}
          {topFive[0] ? (
            <>
              The highest-ranked opportunity — <strong>{topFive[0].title}</strong>{" "}
              — is estimated at {moneyShort(topFive[0].impactLow)}–
              {moneyShort(topFive[0].impactHigh)}/yr.
            </>
          ) : null}
        </p>
```

- [ ] **Step 2: Soften the unconditional multi-contributor claim**

In "How we got here" (line ~135) replace `Only opportunities corroborated by multiple contributors are shown here.` with:

```tsx
          Each opportunity links back to the verbatim captures that drove its
          score, attributed by role.
```

- [ ] **Step 3: Verify in the preview**

Reload the Vizta report as Vera. Expected: the executive summary references the real #1 opportunity ("Automate quantity takeoff ingestion…") and its EUR range — no mention of credit-holds, orders/month, or Finance/Order Ops/Warehouse.

- [ ] **Step 4: Commit**

```bash
git add components/report/ReportArticle.tsx
git commit -m "fix(report): data-driven exec summary, drop hardcoded Northwind fiction"
```

---

## Task 6: Pluralize "contributor"

**Files:**
- Create: `lib/text.ts`
- Test: `lib/text.test.ts`
- Modify: `components/opportunity/OpportunityDetail.tsx:124`

- [ ] **Step 1: Write the failing test**

Create `lib/text.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { pluralize } from "./text";

describe("pluralize", () => {
  it("keeps singular for 1", () => {
    expect(pluralize(1, "contributor")).toBe("1 contributor");
  });
  it("adds -s for other counts", () => {
    expect(pluralize(3, "contributor")).toBe("3 contributors");
    expect(pluralize(0, "contributor")).toBe("0 contributors");
  });
  it("uses an explicit plural form when given", () => {
    expect(pluralize(2, "voice", "voices")).toBe("2 voices");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/text.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/text.ts`:

```typescript
/** "1 contributor" / "3 contributors". Pass `plural` for irregular forms. */
export function pluralize(n: number, singular: string, plural?: string): string {
  const word = n === 1 ? singular : (plural ?? `${singular}s`);
  return `${n} ${word}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/text.test.ts`
Expected: PASS.

- [ ] **Step 5: Use it in OpportunityDetail**

In `components/opportunity/OpportunityDetail.tsx` add `import { pluralize } from "@/lib/text";` near the other imports, then change line 124:

```typescript
            value: pluralize(opp.contributorCount, "contributor"),
```

- [ ] **Step 6: Verify + commit**

Run: `npm run typecheck && npx vitest run lib/text.test.ts`
Expected: PASS.

```bash
git add lib/text.ts lib/text.test.ts components/opportunity/OpportunityDetail.tsx
git commit -m "fix(opportunity): pluralize contributor count"
```

---

## Task 7: Dedupe near-duplicate evidence

**Files:**
- Modify: `server/trpc/routers/opportunity.ts:61-67` (read-layer dedupe — fixes existing rows)
- Modify: `lib/sessions.ts:210-217` (source dedupe — stops new dupes)

- [ ] **Step 1: Read-layer dedupe by normalized source quote**

In `server/trpc/routers/opportunity.ts`, after building `evidence` (the `.map(...)` ending ~line 67) collapse rows whose source quote is the same once normalized:

```typescript
        const seenQuotes = new Set<string>();
        const dedupedEvidence = evidence.filter((e) => {
          const key = e.sourceQuote.toLowerCase().replace(/\s+/g, " ").trim();
          if (seenQuotes.has(key)) return false;
          seenQuotes.add(key);
          return true;
        });
```
Then pass `dedupedEvidence` (instead of `evidence`) into `toOpportunity(...)` on the return line.

- [ ] **Step 2: Stop storing the dupes at the source**

In `lib/sessions.ts` `finalExtraction` (lines 210-217) extend the dedupe key to include the source quote so a paraphrased-summary/same-quote capture is treated as a duplicate:

```typescript
  const existing = await tx
    .select({ summary: captures.summary, sourceQuote: captures.sourceQuote })
    .from(captures)
    .where(eq(captures.sessionId, opts.sessionId));
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const seen = new Set(existing.map((c) => norm(c.summary)));
  const seenQuotes = new Set(existing.map((c) => norm(c.sourceQuote)));

  const fresh = items.filter(
    (c) => !seen.has(norm(c.summary)) && !seenQuotes.has(norm(c.sourceQuote)),
  );
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npx vitest run server lib`
Expected: PASS. In the preview, reload the top Vizta opportunity detail as Vera — the "Por empreitada perdemos uns 4 a 5 dias úteis…" quote now appears once, not twice.

- [ ] **Step 4: Commit**

```bash
git add server/trpc/routers/opportunity.ts lib/sessions.ts
git commit -m "fix(evidence): dedupe captures by source quote (read + final extraction)"
```

---

## Task 8: Clear the stale "Convidado" last-active label on completion

**Files:**
- Modify: `lib/sessions.ts:134-142`

- [ ] **Step 1: Set a real label when a session completes**

In `completeSessionForUser`, the participant-progress update (lines 134-142) currently sets only `sessionsCompleted` + `status`. Add a `lastActiveLabel` so it no longer reads the seeded "Convidado":

```typescript
    await tx
      .update(sprintParticipants)
      .set({
        sessionsCompleted: count,
        status,
        lastActiveLabel: status === "completed" ? "Completed" : "Active recently",
      })
      .where(
        and(
          eq(sprintParticipants.sprintId, sprintId),
          eq(sprintParticipants.userId, claims.userId),
        ),
      );
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npx vitest run lib`
Expected: PASS. (Re-completing a Vizta session, or re-running `scripts/sim-session.ts`, will refresh the label; the manager dashboard then shows "Completed" instead of "Convidado".)

- [ ] **Step 3: Commit**

```bash
git add lib/sessions.ts
git commit -m "fix(sprint): refresh participant last-active label on completion"
```

---

## Task 9: Mark the SOW price as an indicative EUR draft

**Files:**
- Modify: `components/opportunity/OpportunityDetail.tsx:367-371`

- [ ] **Step 1: Label the auto-drafted price as indicative**

The SOW block already shows the eyebrow "Auto-drafted SOW" and routes through `moneyShort` (Task 2). Add an explicit "indicative" caption next to the price so the hardcoded figure (`lib/sow.ts`, €48k/€68k) is honest. In `components/opportunity/OpportunityDetail.tsx` change the price `<Field>` (line ~368-371) to include a caption:

```tsx
          <Field
            label="Indicative price (draft)"
            value={moneyShort(sow.priceUsd)}
          />
```

- [ ] **Step 2: Verify in the preview**

As Vera, open the top opportunity → "Approve as sponsor" → confirm the SOW renders "Indicative price (draft) €68K" (or €48K for a `buy` opportunity).

- [ ] **Step 3: Commit**

```bash
git add components/opportunity/OpportunityDetail.tsx
git commit -m "fix(sow): label auto-drafted price as indicative EUR draft"
```

---

## Final verification

- [ ] **Full gate:** `npm run verify` (typecheck + lint + unit + integration + build) is green.
- [ ] **Preview walkthrough (signed in as Vera, sponsor):**
  - Report exec summary references the real #1 opportunity, EUR figures, no Northwind fiction.
  - "Suggested roadmap" shows the "Solid bets" column populated (not empty).
  - Opportunity detail: "1 contributor" (singular), evidence quote shown once, SOW price in € labelled draft.
- [ ] **Commit any test fixups** discovered during the gate.

## Out of scope (documented follow-ups, NOT this plan)
- Per-tenant currency (column + threading) — today's global EUR default is the demo path.
- Confidence-as-breadth rework (multi-contributor corroboration raising confidence) — operator deferred as not demo-safe.
- LLM-generated SOW (ATL-502) — heuristic draft is acceptable while labelled.
- Portuguese report prose / full i18n — operator chose "EUR currency only".
