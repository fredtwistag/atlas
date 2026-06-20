# De-anonymize Contributors on Sprints — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each contributor's **name and role** (instead of role only) on the quotes/evidence that managers and sponsors see, so sponsors know exactly who reported what and can organize follow-up meetings.

**Architecture:** Atlas already stores `captures.user_id → users.name`. Today every manager/sponsor-facing read deliberately drops the name and substitutes the job title (`users.title`) — enforced in one data-layer function (`lib/sprint-read.ts#loadOpportunityDetail`), rendered in one component (`OpportunityDetail.tsx`), and locked by a privacy regression test. This change threads the name through that single path, inverts the regression test, updates the participant-facing copy that promises anonymity, and updates the docs so a future agent doesn't "fix" it back as a regression. **The LLM/scoring boundary is deliberately left untouched — names never get sent to the model.**

**Tech Stack:** Next.js 15 / React 19 / TypeScript, tRPC + Zod, Drizzle ORM on Postgres, Vitest (unit + embedded-postgres integration), Tailwind.

---

## ⚠️ Decisions baked into this plan (confirmed by product owner 2026-06-20)

These were chosen explicitly, with the trade-offs on the table. They are recorded here so the implementer doesn't re-litigate them — but flag them in the PR description.

1. **Full attribution** — names appear on every evidence quote, not opt-in.
2. **Dashboard + sponsor report** — names appear everywhere a manager/sponsor sees evidence (the opportunity detail page, which the report links into; and the Twistag admin read-only drill-down).
3. **All sprints, including existing ones** — this **overrides the anonymity promise already made to people who contributed to existing sprints** via the `/me` privacy gate. That is a deliberate product call. There is no per-sprint gating and therefore **no DB migration**.

### Explicitly preserved (do NOT change)
- **Names are never sent to the LLM.** `services/opportunity/score.ts`, `services/opportunity/recompute.ts`, and `services/synthesis/stakeholders.ts` continue to receive **role + department only**. Leave their `ScoreCapture` type, queries, and "never a name" comments exactly as they are. There is no product reason to ship PII to the model and several reasons not to.
- **email and internal `userId` stay off evidence items.** We expose `contributorName` + `contributorRole` only. The integration test in Task 1 keeps asserting email/userId never leak.
- **`sprint.participant`, `/me`, and the Twistag admin member list** already show names by design — no change.

### Flagged for a separate decision (Task 5, optional)
The **marketing site** currently sells the anonymity ("*people talk because it's safe to*"). Shipping names makes that copy false. Task 5 proposes edits but is marked **needs product/marketing sign-off** — do not silently rewrite the company's positioning.

---

## File Structure / Map of Changes

| File | Change | Why |
|---|---|---|
| `lib/types.ts` | Add `contributorName: string` to `Capture` | Carry the name through the render-ready type |
| `lib/sprint-read.ts` | Select `users.name`, map to `contributorName`; update privacy comments | The one data-layer chokepoint that builds evidence |
| `lib/data.ts` | Add `contributorName` to the 11 mock captures | Keep the type compiling + give component tests/demo real names |
| `components/opportunity/OpportunityDetail.tsx` | Render `name · role`; rewrite the evidence footnote | The one component that renders evidence quotes |
| `components/report/ReportArticle.tsx` | Methodology + footer copy | Report no longer claims "by role only" |
| `components/me/PrivacyGate.tsx` | Rewrite the anonymity promises | Stop promising something we no longer do |
| `app/(app)/me/page.tsx` | Privacy reassurance blurb | Same |
| `server/trpc/router.integration.test.ts` | Invert the privacy regression test | Lock the new invariant (name+role present; email/userId absent) |
| `components/opportunity/OpportunityDetail.test.tsx` | Add an attribution render test | Prove the name renders |
| `CLAUDE.md`, `docs/06-security-compliance.md` | Update "Privacy by design" | So this isn't treated as a future regression |
| `app/(marketing)/page.tsx`, `components/marketing/HeroReport.tsx` | (Task 5, flagged) | Marketing truthfulness |

---

## Task 1: Thread `contributorName` through the data layer

**Files:**
- Modify: `server/trpc/router.integration.test.ts:1008-1033`
- Modify: `lib/types.ts:91-101`
- Modify: `lib/sprint-read.ts:8-10`, `:242-245`, `:256-266`, `:279-288`
- Modify: `lib/data.ts` (11 capture literals — table below)

- [ ] **Step 1: Invert the privacy regression test**

In `server/trpc/router.integration.test.ts`, replace the comment block and test at lines **1008-1033** (the `it("opportunity.get evidence carries the contributor ROLE, never the name/email", …)` block) with:

```ts
  // ATTRIBUTION (de-anonymized, plan 2026-06-20-deanonymize-contributors).
  // IC quotes/evidence are shown with the contributor's NAME and ROLE in
  // manager/sponsor-facing views, so sponsors know exactly who to follow up
  // with. The contributor's email and internal userId are still NEVER exposed
  // on evidence items. The seeded IC is name="Evidence IC",
  // email="evidence-ic@a.example", title="Ops Analyst".
  it("opportunity.get evidence carries the contributor NAME and ROLE (not email/userId)", async () => {
    const opp = await asManager(TENANT_A, MGR_A).opportunity.get({
      id: OPP_ID,
    });

    // Name and role both surface so the manager knows exactly who said it…
    expect(opp.evidence[0]?.contributorName).toBe("Evidence IC");
    expect(opp.evidence[0]?.contributorRole).toBe("Ops Analyst");

    // …but the email and internal userId never leak onto evidence items.
    const serialized = JSON.stringify(opp);
    expect(serialized).not.toContain("evidence-ic@a.example");
    for (const e of opp.evidence) {
      expect(e).not.toHaveProperty("email");
      expect(e).not.toHaveProperty("userId");
    }
  });
```

> Leave the two following tests (`opportunity.listForSprint … never carries contributor names/emails` at ~1035 and `sprint.progress … never carries contributor names/emails` at ~1046) **unchanged**. Those feeds carry no evidence, so names legitimately never appear there — they remain valid PII invariants.

- [ ] **Step 2: Run the integration test to verify it fails**

Run: `npx vitest run --config vitest.integration.config.ts server/trpc/router.integration.test.ts -t "NAME and ROLE"`
Expected: FAIL — `contributorName` does not exist on the evidence type / is `undefined`.

- [ ] **Step 3: Add `contributorName` to the `Capture` type**

In `lib/types.ts`, replace the `Capture` interface (lines **91-101**) with:

```ts
export interface Capture {
  id: string;
  kind: CaptureKind;
  summary: string;
  sourceQuote: string;
  /** Contributor's full name — shown in manager/sponsor-facing views so
   * sponsors know who to follow up with (de-anonymized 2026-06-20). */
  contributorName: string;
  /** Contributor's role/title, shown alongside the name. */
  contributorRole: string;
  tags: string[];
  isEdited?: boolean;
  isRemoved?: boolean;
}
```

- [ ] **Step 4: Select and map the name in the data layer**

In `lib/sprint-read.ts`, update `loadOpportunityDetail`.

First, the evidence select (lines **256-266**) — add `name: users.name`:

```ts
  const evRows = await tx
    .select({
      id: captures.id,
      kind: captures.kind,
      summary: captures.summary,
      sourceQuote: captures.sourceQuote,
      tags: captures.tags,
      isEdited: captures.isEdited,
      isRemoved: captures.isRemoved,
      name: users.name,
      role: users.title,
    })
```

Then the evidence map (lines **279-288**) — add `contributorName`:

```ts
  const evidence: Capture[] = evRows.map((e) => ({
    id: e.id,
    kind: e.kind as Capture["kind"],
    summary: e.summary,
    sourceQuote: e.sourceQuote,
    contributorName: e.name,
    contributorRole: e.role ?? "Contributor",
    tags: e.tags,
    isEdited: e.isEdited,
    isRemoved: e.isRemoved,
  }));
```

- [ ] **Step 5: Fix the now-false privacy comments in the same file**

In `lib/sprint-read.ts`, replace the file-header privacy note (lines **8-10**):

```ts
 * Privacy: these expose aggregates and opportunity metadata. Evidence quotes
 * carry the contributor's NAME + ROLE (de-anonymized 2026-06-20); email and
 * internal userId are never exposed. Names are never sent to the LLM.
```

And replace the `loadOpportunityDetail` docstring privacy line (lines **242-245**):

```ts
 * Privacy: evidence is attributed by NAME + ROLE so sponsors can follow up with
 * the contributor directly (de-anonymized 2026-06-20). Email and internal userId
 * never leave this layer; removed captures are still excluded.
```

- [ ] **Step 6: Add `contributorName` to the mock captures so the type compiles**

In `lib/data.ts`, add a `contributorName` field to each of the 11 capture literals, immediately above its existing `contributorRole` line. Use exactly these names (distinct people for the two AR Specialists demonstrates *why* names matter; reused names = the same person across sessions):

| Capture id | line | `contributorRole` (existing) | add `contributorName:` |
|---|---|---|---|
| `c-1` | 377 | `"AR Specialist"` | `"Dana Whitfield"` |
| `c-2` | 387 | `"Fulfillment Coordinator"` | `"Marcus Reyes"` |
| `c-3` | 397 | `"Order Operations Lead"` | `"Priya Nandakumar"` |
| `c-4` | 472 | `"Sales Operations Manager"` | `"Tom Becker"` |
| `c-5` | 482 | `"Billing Analyst"` | `"Aisha Karim"` |
| `c-6` | 550 | `"CS Team Lead"` | `"Jordan Liu"` |
| `c-7` | 559 | `"Order Coordinator"` | `"Sam Okafor"` |
| `c-8` | 628 | `"AR Specialist"` | `"Elena Vasquez"` |
| `c-9` | 695 | `"CS Team Lead"` | `"Jordan Liu"` |
| `c-10` | 762 | `"Order Operations Lead"` | `"Priya Nandakumar"` |
| `c-11` | 829 | `"Order Coordinator"` | `"Sam Okafor"` |

Example — `c-1` becomes:

```ts
      {
        id: "c-1",
        kind: "bottleneck",
        contributorName: "Dana Whitfield",
        contributorRole: "AR Specialist",
        summary:
          "Credit-hold queue is worked once daily, so most holds wait overnight before release.",
```

Apply the identical one-line insertion to `c-2` … `c-11` using the table.

- [ ] **Step 7: Run the integration test + typecheck to verify they pass**

Run: `npx vitest run --config vitest.integration.config.ts server/trpc/router.integration.test.ts -t "NAME and ROLE" && npm run typecheck`
Expected: test PASS; `tsc --noEmit` exits 0 (every `Capture` literal now has `contributorName`).

- [ ] **Step 8: Commit**

```bash
git add lib/types.ts lib/sprint-read.ts lib/data.ts server/trpc/router.integration.test.ts
git commit -m "feat(evidence): attribute quotes by contributor name + role (not role-only)

Threads users.name through loadOpportunityDetail. Email/userId still never
exposed; LLM boundary unchanged. Product decision 2026-06-20: full attribution
across all sprints.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Render the name on evidence quotes

**Files:**
- Modify: `components/opportunity/OpportunityDetail.tsx:216-239`
- Test: `components/opportunity/OpportunityDetail.test.tsx` (add a describe block)

- [ ] **Step 1: Write the failing render test**

Append to `components/opportunity/OpportunityDetail.test.tsx` (the file already defines `getFixtures()` which loads mock `opp-1`, whose first capture `c-1` is now `Dana Whitfield`, `AR Specialist`):

```ts
describe("OpportunityDetail evidence attribution", () => {
  it("shows the contributor's name and role on each evidence quote", async () => {
    const { opp, sow } = await getFixtures();
    render(
      <OpportunityDetail sprintId="spr-northwind-q2" opp={opp} sow={sow} />,
    );

    // The Evidence tab is selected by default; opp-1's first capture is c-1.
    expect(screen.getByText("Dana Whitfield")).toBeInTheDocument();
    expect(screen.getByText(/AR Specialist/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/opportunity/OpportunityDetail.test.tsx -t "name and role"`
Expected: FAIL — only the role currently renders, so `"Dana Whitfield"` is not found.

- [ ] **Step 3: Render name · role in the evidence header**

In `components/opportunity/OpportunityDetail.tsx`, replace the evidence-card header (lines **218-223**):

```tsx
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Badge tone="neutral">{c.kind}</Badge>
                    <span className="text-right text-xs font-medium text-text-2">
                      {c.contributorName}
                      <span className="text-text-3"> · {c.contributorRole}</span>
                    </span>
                  </div>
```

- [ ] **Step 4: Rewrite the evidence footnote (it currently promises anonymity)**

In the same file, replace the footnote paragraph (lines **235-239**):

```tsx
              <p className="px-1 text-xs leading-relaxed text-text-3">
                Quotes are attributed to each contributor by name and role so you
                know who to follow up with. Contributors can still edit or remove
                anything they said for 7 days after their session.
              </p>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run components/opportunity/OpportunityDetail.test.tsx`
Expected: PASS (new test + the existing approve-flow / tab a11y tests all green).

- [ ] **Step 6: Commit**

```bash
git add components/opportunity/OpportunityDetail.tsx components/opportunity/OpportunityDetail.test.tsx
git commit -m "feat(ui): show contributor name + role on opportunity evidence quotes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Update participant-facing copy that promises anonymity

These are static-string changes (no branching logic), so they're verified by `grep` + the typecheck/build rather than a brittle render test — the server-action import in `PrivacyGate` makes a jsdom render test fragile. Each edit removes a now-false "never by name" promise.

**Files:**
- Modify: `components/me/PrivacyGate.tsx:7-12`
- Modify: `app/(app)/me/page.tsx:214-218`
- Modify: `components/report/ReportArticle.tsx:136-137`, `:142-144`, `:204-206`

- [ ] **Step 1: Rewrite the `/me` privacy gate promises**

In `components/me/PrivacyGate.tsx`, replace the `PROMISES` array (lines **6-12**):

```ts
// The privacy promises shown before a participant's first session (PRD F1.5).
const PROMISES = [
  "Attributed to you by name and role in what your manager and sponsor see — so they can follow up with you directly.",
  "Edit or remove anything you said for 7 days after each session.",
  "Skip any question you'd rather not answer.",
  "Only the themes and quotes from your sessions are shared — never your full transcript.",
];
```

- [ ] **Step 2: Rewrite the `/me` privacy reassurance blurb**

In `app/(app)/me/page.tsx`, replace the `<p>` inside the privacy reassurance box (lines **214-218**):

```tsx
        <p>
          What you say is attributed to you by{" "}
          <strong>name and role</strong> in anything your manager or sponsor
          sees, so they can follow up with you directly. You can edit or remove
          anything you said for 7 days after each session.
        </p>
```

- [ ] **Step 3: Rewrite the report methodology + footer copy**

In `components/report/ReportArticle.tsx`:

Replace the methodology sentence ending at lines **135-137** (`… from each reply, attributed by role, never by name.`):

```tsx
          how work flows, where it breaks, the tools involved, and the one
          change they&apos;d make. An extraction pass lifted concrete moments —
          bottlenecks, workarounds, handoffs — from each reply, attributed to
          the contributor by name and role.
```

Replace the second methodology sentence (lines **142-144**, `… that drove its score, attributed by role.`):

```tsx
          dimensions: financial impact, implementation feasibility, time to
          value, strategic alignment, and evidence confidence. Each opportunity
          links back to the verbatim captures that drove its score, attributed
          to the contributor by name and role.
```

Replace the footer line (lines **204-206**, `… Built by Twistag. Quotes attributed by role only.`):

```tsx
      <footer className="mt-12 border-t border-border pt-6 text-xs text-text-3">
        Generated by Atlas · {sprint.startDate} – {sprint.endDate} · Built by
        Twistag. Quotes attributed to contributors by name and role.
      </footer>
```

- [ ] **Step 4: Verify no participant-facing surface still promises anonymity**

Run: `rg -n "never by name|by role only|role, never|attributed by role" components app/\(app\)`
Expected: **no matches** (all participant/manager/report surfaces updated). Marketing files under `app/(marketing)` and `components/marketing` may still match — those are Task 5.

- [ ] **Step 5: Run unit tests + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS (no test asserts the old strings).

- [ ] **Step 6: Commit**

```bash
git add components/me/PrivacyGate.tsx "app/(app)/me/page.tsx" components/report/ReportArticle.tsx
git commit -m "fix(copy): stop promising anonymity in participant + report copy

Contributors are now told their name+role is attributed to their manager and
sponsor. Reflects the 2026-06-20 de-anonymization decision.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Update the docs so this isn't treated as a future regression

`CLAUDE.md` is read first by every agent and currently states names are *never* shown. If left unchanged, the next person will "fix" this change as a privacy bug. Update it and the security doc to make name+role the documented invariant — while reaffirming the LLM boundary.

**Files:**
- Modify: `CLAUDE.md` ("Privacy by design" section)
- Modify: `docs/06-security-compliance.md:31`, `:72`

- [ ] **Step 1: Update `CLAUDE.md` "Privacy by design"**

Replace the "Privacy by design" bullet list with:

```markdown
## Privacy by design

- IC quotes ARE displayed with the contributor's **name and role** in the manager/sponsor UI, so sponsors can follow up directly. (Changed 2026-06-20 — see `docs/superpowers/plans/2026-06-20-deanonymize-contributors.md`. Earlier builds were role-only.)
- **Names are NEVER sent to the LLM.** The scoring/extraction/synthesis boundary (`services/opportunity/score.ts`, `services/opportunity/recompute.ts`, `services/synthesis/stakeholders.ts`) receives **role + department only** — keep it that way.
- Evidence items expose **name + role only** — never the contributor's email or internal `userId`.
- ICs can still edit or remove anything they said for 7 days after each session (`/me`).
- Do not log full conversation transcripts to general application logs.
```

- [ ] **Step 2: Update `docs/06-security-compliance.md`**

Replace line **31** (`- IC quotes are **never** displayed with the IC's name in the manager UI`):

```markdown
- IC quotes are displayed with the contributor's **name and role** in the manager/sponsor UI (changed 2026-06-20); names are never sent to the LLM, and email/userId are never exposed on evidence
```

Replace line **72** (`- Aggregation: manager UI never shows individual quotes with names`):

```markdown
- Attribution: manager/sponsor UI shows individual quotes with the contributor's name and role; the LLM scoring boundary still receives role/department only
```

- [ ] **Step 3: Verify the docs are internally consistent**

Run: `rg -n "name" CLAUDE.md docs/06-security-compliance.md | rg -i "never.*name|name.*never"`
Expected: the only "never … name" matches that remain are about the **LLM boundary** (names never sent to the model), not about the manager UI.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/06-security-compliance.md
git commit -m "docs: name+role attribution is the new privacy invariant (LLM boundary preserved)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5 (FLAGGED — needs product/marketing sign-off before doing): Marketing copy

The marketing site sells anonymity as the reason people speak candidly. With names now shown, that claim is false. **Do not run this task without explicit sign-off** — the fix might be to reposition (e.g. "your input is attributed so the right people can act on it"), not just delete a sentence. If approved:

**Files:**
- Modify: `app/(marketing)/page.tsx:97`
- Modify: `components/marketing/HeroReport.tsx:194`

- [ ] **Step 1: Update the marketing feature blurb**

In `app/(marketing)/page.tsx`, replace line **97**:

```ts
    "Click any score and see the quotes and signals that support it. Every quote is attributed to the person who raised it, by name and role — so the right people can act on it.",
```

- [ ] **Step 2: Update the hero report caption**

In `components/marketing/HeroReport.tsx`, replace line **194**:

```tsx
        Demo data. Real reports attribute every quote to the contributor by name and role.
```

- [ ] **Step 3: Verify + commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add "app/(marketing)/page.tsx" components/marketing/HeroReport.tsx
git commit -m "copy(marketing): reflect named attribution instead of anonymity

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after Tasks 1-4, and 5 if approved)

- [ ] **Run the full verification suite**

Run: `npm run verify`
Expected: typecheck, lint, unit tests, integration tests, and build all PASS. The key signals:
- `router.integration.test.ts` — "carries the contributor NAME and ROLE" PASSES; the listForSprint / sprint.progress PII tests still PASS.
- `OpportunityDetail.test.tsx` — attribution test PASSES.

- [ ] **Manual smoke (optional but recommended)**

Run `npm run dev`, sign in as a manager (demo tenant `spr-northwind-q2`), open any opportunity → Evidence tab. Each quote should show e.g. **"Dana Whitfield · AR Specialist"**. Confirm the same on the sponsor report's linked opportunity detail and the Twistag admin read-only drill-down.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- "Names not anonymized on sprints / know who reported what" → Tasks 1-2 (data + render).
- "Dashboard + sponsor report" → `loadOpportunityDetail` feeds both the manager detail page and the report's linked detail + the Twistag admin drill-down (all share `OpportunityDetail.tsx`). ✓
- "All sprints incl. existing" → no per-sprint gating, no migration. ✓
- Truthfulness of remaining copy → Tasks 3-4 (and 5, flagged). ✓
- LLM boundary preserved → asserted in the test (email/userId absent) and documented; no edits to `score.ts`/`recompute.ts`/`stakeholders.ts`. ✓

**Placeholder scan:** No TBDs; every code step shows full code. The 11 mock edits are enumerated in a table with the exact value to insert and a worked example. ✓

**Type consistency:** `contributorName: string` defined in Task 1 Step 3; constructed in `lib/sprint-read.ts` (Step 4) and `lib/data.ts` (Step 6); consumed in `OpportunityDetail.tsx` (Task 2) and asserted as `opp.evidence[0].contributorName` (Task 1 Step 1). Names match throughout. ✓

**Known gap to call out in the PR:** existing contributors consented to role-only attribution; applying names retroactively to existing sprints is the deliberate decision in the header. The PR description should say so plainly.
