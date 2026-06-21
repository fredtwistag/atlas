# Report Redesign — Slice 1: Content & Layout Implementation Plan (1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the sprint report into a hybrid-hero "cockpit": a hero that leads with the recoverable € + recommended move, the workflow diagrams promoted to first-class insight cards ("What we found"), and opportunities led by the impact/effort matrix — by decomposing the oversized `ReportArticle.tsx` into focused components.

**Architecture:** Pure presentational React server components under `components/report/`, composed by a slimmer `ReportArticle.tsx`. A pure `lib/report-hero.ts` derives the headline. Diagrams reuse `WorkflowDiagram` + `WorkflowMapView` (already on main). No data-fetch changes — the report page already provides `sprint/progress/opps/memo/workflowMaps`; this plan adds one `isSponsor` prop for CTA labeling.

**Tech Stack:** Next.js 15 React 19 server components, Tailwind (design tokens: `bg-surface`, `text-text/-2/-3`, `border-border`, `text-brand`, `text-success`), vitest + jsdom + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-06-21-report-experience-redesign-design.md` (§6). **Slice 1 of 3** — Slice 2 (drill-down sidebar) and Slice 3 (shareable links) are separate plans. This slice ships with an in-content sticky decision bar (Slice 2 migrates it into the sidebar). Depends on the workflow-maps work already on main (`WorkflowDiagram`, `loadWorkflowMaps`, `WorkflowMapView`).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `lib/report-hero.ts` (+test) | `reportHeadline()` — derive the punchy headline (pure) | Create |
| `components/report/ReportHero.tsx` (+test) | Hero: eyebrow, headline, sub, metrics, recommended-move CTA | Create |
| `components/report/InsightCard.tsx` (+test) | One promoted workflow map: headline + diagram + evidence disclosure | Create |
| `components/report/FindingsSection.tsx` (+test) | "What we found" — swimlane/topology maps as insight cards | Create |
| `components/report/RankedOpportunityTable.tsx` (+test) | Compact ranked table for opportunities 4..N | Create |
| `components/report/OpportunitiesSection.tsx` (+test) | Matrix overview + top-3 cards + ranked table | Create |
| `components/report/RoadmapSection.tsx` (+test) | "Suggested roadmap" (extracted) | Create |
| `components/report/StickyDecisionBar.tsx` (+test) | Slim sticky recommended-move + CTA | Create |
| `components/report/ReportArticle.tsx` | Recompose into the new IA; keep `Section`/footer/methodology prose | Modify |
| `app/(app)/sprint/[id]/report/page.tsx` | Pass `isSponsor` to `ReportArticle` | Modify |

No barrel files (CLAUDE.md). Co-locate `*.test.tsx` next to source. Component tests use `// @vitest-environment jsdom` + `@testing-library/react` (match `components/ScoreBadge.test.tsx`).

**Commands:** unit/component `npx vitest run <path>`; typecheck `npx tsc --noEmit`.

> Note: the repo has uncommitted WIP elsewhere — every commit step stages ONLY the named files. Never `git add -A`/`.`.

---

## Task 1: `reportHeadline` (pure)

**Files:**
- Create: `lib/report-hero.ts`
- Create: `lib/report-hero.test.ts`

- [ ] **Step 1: Write the failing test `lib/report-hero.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { reportHeadline } from "./report-hero";

describe("reportHeadline", () => {
  it("leads with the recoverable range and the tenant when there is impact", () => {
    const h = reportHeadline({ tenantName: "Vizta", totalLow: 163000, totalHigh: 314000, currency: "EUR" });
    expect(h).toContain("Vizta");
    expect(h).toMatch(/€16\d?K.*€31\d?K/);
    expect(h.toLowerCase()).toContain("recoverable");
  });
  it("falls back to an honest empty-state line when there is no impact", () => {
    const h = reportHeadline({ tenantName: "Vizta", totalLow: 0, totalHigh: 0, currency: "EUR" });
    expect(h.toLowerCase()).toContain("underway");
    expect(h).not.toContain("€0");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/report-hero.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `lib/report-hero.ts`**

```typescript
import { moneyShort, type Currency } from "@/lib/format";

/**
 * The report's lead headline — the recoverable money framed as the insight.
 * Data-derived (no LLM). Honest empty state when nothing is scored yet.
 */
export function reportHeadline(opts: {
  tenantName: string;
  totalLow: number;
  totalHigh: number;
  currency: Currency;
}): string {
  if (opts.totalHigh <= 0) {
    return `Discovery is underway at ${opts.tenantName} — opportunities appear here as sessions complete.`;
  }
  const range = `${moneyShort(opts.totalLow, opts.currency)}–${moneyShort(opts.totalHigh, opts.currency)}`;
  return `${range}/yr is recoverable in how ${opts.tenantName} works today.`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/report-hero.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/report-hero.ts lib/report-hero.test.ts
git commit -m "feat(report): reportHeadline — recoverable-money headline (pure)"
```

---

## Task 2: `ReportHero`

**Files:**
- Create: `components/report/ReportHero.tsx`
- Create: `components/report/ReportHero.test.tsx`

- [ ] **Step 1: Write the failing test `components/report/ReportHero.test.tsx`**

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReportHero } from "./ReportHero";
import type { Sprint, SprintProgress, Opportunity } from "@/lib/types";

const sprint = { tenantName: "Vizta", name: "Q2", tenantDomain: null, primaryFocus: "ops", scopeDepartment: "Ops", tenantCurrency: "EUR", sponsor: { name: "Vera", title: "Admin" } } as unknown as Sprint;
const progress = { opportunitiesCount: 9, highImpactCount: 3, capturesCount: 46, sessionsCompleted: 3, participantCount: 3, completionPct: 100 } as unknown as SprintProgress;
const opp = (id: string, impactLow: number, impactHigh: number, title: string) =>
  ({ id, impactLow, impactHigh, title, timeToShipWeeksLow: 4, timeToShipWeeksHigh: 6, contributorCount: 7 }) as unknown as Opportunity;
const opps = [opp("o1", 56000, 75000, "Automate quantity-map ingestion"), opp("o2", 36000, 54000, "B")];

describe("ReportHero", () => {
  it("renders the headline and the top opportunity as the recommended move", () => {
    render(<ReportHero sprint={sprint} progress={progress} opps={opps} currency="EUR" />);
    expect(screen.getByText(/recoverable/i)).toBeTruthy();
    expect(screen.getByText(/Automate quantity-map ingestion/)).toBeTruthy();
  });
  it("shows an Approve CTA labeled for a sponsor only when a link + sponsor are given", () => {
    const { rerender } = render(<ReportHero sprint={sprint} progress={progress} opps={opps} currency="EUR" opportunityHref={(id) => `/o/${id}`} isSponsor />);
    expect(screen.getByRole("link", { name: /approve/i })).toBeTruthy();
    rerender(<ReportHero sprint={sprint} progress={progress} opps={opps} currency="EUR" opportunityHref={(id) => `/o/${id}`} isSponsor={false} />);
    expect(screen.queryByRole("link", { name: /approve/i })).toBeNull();
    expect(screen.getByRole("link", { name: /review/i })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/report/ReportHero.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `components/report/ReportHero.tsx`**

```typescript
import Link from "next/link";
import { CompanyLogo } from "@/components/CompanyLogo";
import { reportHeadline } from "@/lib/report-hero";
import { moneyShort } from "@/lib/format";
import type { Sprint, SprintProgress, Opportunity } from "@/lib/types";
import type { Currency } from "@/lib/format";

/** The report hero: headline + key metrics + the recommended first move. */
export function ReportHero({
  sprint,
  progress: p,
  opps,
  currency,
  opportunityHref,
  isSponsor = false,
}: {
  sprint: Sprint;
  progress: SprintProgress;
  opps: Opportunity[];
  currency: Currency;
  opportunityHref?: (id: string) => string;
  isSponsor?: boolean;
}) {
  const totalLow = opps.slice(0, 5).reduce((s, o) => s + o.impactLow, 0);
  const totalHigh = opps.slice(0, 5).reduce((s, o) => s + o.impactHigh, 0);
  const top = opps[0];
  const metrics: [string, string][] = [
    [`${p.opportunitiesCount}`, "Opportunities"],
    [`${p.highImpactCount}`, "High-impact"],
    [`${moneyShort(totalLow, currency)}+`, "Est. impact / yr"],
  ];

  return (
    <header className="mb-10 border-b border-border pb-8">
      <div className="mb-4 flex items-center gap-3">
        <CompanyLogo domain={sprint.tenantDomain} name={sprint.tenantName} size="md" />
        <div className="text-xs font-semibold uppercase tracking-[0.1em] text-brand">
          Atlas discovery report · {sprint.name}
        </div>
      </div>
      <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight">
        {reportHeadline({ tenantName: sprint.tenantName, totalLow, totalHigh, currency })}
      </h1>
      <p className="mt-3 text-md text-text-2">
        {p.participantCount} people · {p.sessionsCompleted} sessions · {p.capturesCount} captures across {sprint.scopeDepartment}.
      </p>

      <div className="not-prose mt-6 grid grid-cols-3 gap-3">
        {metrics.map(([v, l]) => (
          <div key={l} className="rounded-lg bg-surface-2 p-4">
            <div className="text-2xl font-semibold tracking-tight">{v}</div>
            <div className="mt-1 text-xs text-text-3">{l}</div>
          </div>
        ))}
      </div>

      {top ? (
        <div className="not-prose mt-4 flex items-center justify-between gap-4 rounded-lg border border-accent-blue bg-accent-blue-soft p-4">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-accent-blue-text">
              Recommended first move
            </div>
            <div className="truncate text-md font-medium">{top.title}</div>
            <div className="text-xs text-text-2">
              {moneyShort(top.impactLow, currency)}–{moneyShort(top.impactHigh, currency)}/yr ·{" "}
              {top.timeToShipWeeksLow}–{top.timeToShipWeeksHigh} wks · backed by {top.contributorCount} people
            </div>
          </div>
          {opportunityHref ? (
            <Link
              href={opportunityHref(top.id)}
              className="shrink-0 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
            >
              {isSponsor ? "Approve →" : "Review →"}
            </Link>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
```

- [ ] **Step 4: Run to verify it passes + typecheck**

Run: `npx vitest run components/report/ReportHero.test.tsx && npx tsc --noEmit`
Expected: PASS (2 tests), tsc exit 0. If `bg-surface-2`/`bg-accent-blue-soft`/`text-accent-blue-text`/`bg-brand-hover` aren't valid Tailwind tokens, confirm against `tailwind.config.js`/`design/tokens.css` and use the real token names (they exist per `components/ScoreBadge.tsx`, which uses `bg-accent-blue`, `text-accent-blue-text`, `bg-surface-2`).

- [ ] **Step 5: Commit**

```bash
git add components/report/ReportHero.tsx components/report/ReportHero.test.tsx
git commit -m "feat(report): ReportHero — headline, metrics, recommended move"
```

---

## Task 3: `InsightCard`

**Files:**
- Create: `components/report/InsightCard.tsx`
- Create: `components/report/InsightCard.test.tsx`

- [ ] **Step 1: Write the failing test `components/report/InsightCard.test.tsx`**

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InsightCard } from "./InsightCard";
import type { WorkflowMapView } from "@/services/synthesis/workflows/types";

const map: WorkflowMapView = {
  id: "m1",
  kind: "swimlane",
  title: "Most of an order's lead time is spent re-keying into the ERP.",
  basedOnSessions: 3,
  graph: { kind: "swimlane", title: "x", lanes: [], steps: [{ id: "s1", label: "Re-key", laneId: null, stepKind: "bottleneck", inferred: false, captureIds: [], metric: null }], edges: [], confidence: { score: 0.8, coverage: 1, corroboratedCount: 2, disputedStepIds: [] }, modelVersion: "m" },
  confidence: { score: 0.8, coverage: 1, corroboratedCount: 2, disputedStepIds: [] },
  evidence: [{ id: "c1", kind: "bottleneck", summary: "we re-key everything", sourceQuote: "I retype it all by hand", contributorName: "Dana Rep", contributorRole: "Ops", tags: [] }],
};

describe("InsightCard", () => {
  it("renders the headline, an svg diagram, the session basis, and the evidence quote", () => {
    render(<InsightCard map={map} />);
    expect(screen.getByText(/spent re-keying into the ERP/)).toBeTruthy();
    expect(document.querySelector("svg")).not.toBeNull();
    expect(screen.getByText(/Based on 3 sessions/)).toBeTruthy();
    expect(screen.getByText(/Dana Rep/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/report/InsightCard.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `components/report/InsightCard.tsx`**

```typescript
import { WorkflowDiagram } from "@/components/workflow/WorkflowDiagram";
import type { WorkflowMapView } from "@/services/synthesis/workflows/types";

/**
 * A finding: a workflow map promoted to a headline insight, with the diagram
 * as evidence and the name+role-attributed quotes one click away.
 */
export function InsightCard({ map }: { map: WorkflowMapView }) {
  return (
    <figure className="rounded-lg border border-border bg-surface p-5">
      <figcaption className="mb-1 flex items-start justify-between gap-3">
        <h3 className="text-md font-medium leading-snug text-text">{map.title}</h3>
        <span className="shrink-0 text-xs text-text-3">
          Based on {map.basedOnSessions} session{map.basedOnSessions === 1 ? "" : "s"}
        </span>
      </figcaption>
      <div className="not-prose mt-3 overflow-x-auto">
        <WorkflowDiagram graph={map.graph} instanceId={map.id} />
      </div>
      {map.evidence.length > 0 ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-text-3 hover:text-text-2">
            {map.evidence.length} quote{map.evidence.length === 1 ? "" : "s"} from the people who described it
          </summary>
          <ul className="mt-2 space-y-2 border-l border-border pl-3">
            {map.evidence.map((c) => (
              <li key={c.id}>
                <div className="text-xs font-medium text-text-2">
                  {c.contributorName} <span className="text-text-3">· {c.contributorRole}</span>
                </div>
                <p className="text-[13px] italic leading-relaxed text-text-2">&ldquo;{c.sourceQuote}&rdquo;</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </figure>
  );
}
```

- [ ] **Step 4: Run to verify it passes + typecheck**

Run: `npx vitest run components/report/InsightCard.test.tsx && npx tsc --noEmit`
Expected: PASS (1 test), tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add components/report/InsightCard.tsx components/report/InsightCard.test.tsx
git commit -m "feat(report): InsightCard — diagram promoted to headline evidence"
```

---

## Task 4: `FindingsSection`

**Files:**
- Create: `components/report/FindingsSection.tsx`
- Create: `components/report/FindingsSection.test.tsx`

- [ ] **Step 1: Write the failing test `components/report/FindingsSection.test.tsx`**

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FindingsSection } from "./FindingsSection";
import type { WorkflowMapView } from "@/services/synthesis/workflows/types";

const mk = (id: string, kind: WorkflowMapView["kind"], title: string): WorkflowMapView => ({
  id, kind, title, basedOnSessions: 1,
  graph: { kind, title, lanes: [], steps: [{ id: "s", label: "x", laneId: null, stepKind: "step", inferred: false, captureIds: [], metric: kind === "impact_effort" ? { x: 1, y: 1 } : null }], edges: [], confidence: { score: 1, coverage: 1, corroboratedCount: 1, disputedStepIds: [] }, modelVersion: "m" },
  confidence: { score: 1, coverage: 1, corroboratedCount: 1, disputedStepIds: [] }, evidence: [],
});

describe("FindingsSection", () => {
  it("renders swimlane + topology maps but NOT the impact_effort matrix", () => {
    render(<FindingsSection maps={[mk("a", "swimlane", "Flow finding"), mk("b", "systems_topology", "Systems finding"), mk("c", "impact_effort", "Matrix")]} />);
    expect(screen.getByText("Flow finding")).toBeTruthy();
    expect(screen.getByText("Systems finding")).toBeTruthy();
    expect(screen.queryByText("Matrix")).toBeNull();
  });
  it("renders nothing when there are no findings maps", () => {
    const { container } = render(<FindingsSection maps={[mk("c", "impact_effort", "Matrix")]} />);
    expect(container.textContent).toBe("");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/report/FindingsSection.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `components/report/FindingsSection.tsx`**

```typescript
import { InsightCard } from "./InsightCard";
import type { WorkflowMapView } from "@/services/synthesis/workflows/types";

const FINDING_KINDS = new Set(["swimlane", "systems_topology"]);

/**
 * "What we found" — workflow maps promoted to insight cards. The impact/effort
 * matrix is excluded here; it leads the Opportunities section instead.
 */
export function FindingsSection({ maps }: { maps: WorkflowMapView[] }) {
  const findings = maps.filter((m) => FINDING_KINDS.has(m.kind));
  if (findings.length === 0) return null;
  return (
    <section className="mb-10">
      <h2 className="mb-2 text-2xl font-semibold tracking-tight">What we found</h2>
      <p className="mb-4 text-md leading-relaxed text-text-2">
        Synthesized from what contributors described — every step traces to its captures. Steps Atlas inferred to connect the flow are dashed.
      </p>
      <div className="not-prose space-y-5">
        {findings.map((m) => (
          <InsightCard key={m.id} map={m} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run to verify it passes + typecheck**

Run: `npx vitest run components/report/FindingsSection.test.tsx && npx tsc --noEmit`
Expected: PASS (2 tests), tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add components/report/FindingsSection.tsx components/report/FindingsSection.test.tsx
git commit -m "feat(report): FindingsSection — what we found (swimlane/topology)"
```

---

## Task 5: `RankedOpportunityTable`

**Files:**
- Create: `components/report/RankedOpportunityTable.tsx`
- Create: `components/report/RankedOpportunityTable.test.tsx`

- [ ] **Step 1: Write the failing test `components/report/RankedOpportunityTable.test.tsx`**

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RankedOpportunityTable } from "./RankedOpportunityTable";
import type { Opportunity } from "@/lib/types";

const opp = (id: string, n: number, title: string): Opportunity =>
  ({ id, compositeScore: n, title, impactLow: 10000, impactHigh: 20000, category: "Ops" }) as unknown as Opportunity;

describe("RankedOpportunityTable", () => {
  it("renders a row per opportunity with a link when href is given", () => {
    render(<RankedOpportunityTable opps={[opp("o4", 5.2, "Fourth"), opp("o5", 4.8, "Fifth")]} currency="EUR" startRank={4} href={(id) => `/o/${id}`} />);
    expect(screen.getByText("Fourth")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Fifth/ })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/report/RankedOpportunityTable.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `components/report/RankedOpportunityTable.tsx`**

```typescript
import Link from "next/link";
import { moneyShort, type Currency } from "@/lib/format";
import type { Opportunity } from "@/lib/types";

/** Compact ranked list for the opportunities below the elevated top three. */
export function RankedOpportunityTable({
  opps,
  currency,
  startRank,
  href,
}: {
  opps: Opportunity[];
  currency: Currency;
  startRank: number;
  href?: (id: string) => string;
}) {
  if (opps.length === 0) return null;
  return (
    <table className="not-prose w-full border-collapse">
      <tbody>
        {opps.map((o, i) => (
          <tr key={o.id} className="border-b border-border last:border-0">
            <td className="py-2.5 pr-3 align-top font-mono text-sm tabular-nums text-text-3">
              {startRank + i}
            </td>
            <td className="py-2.5 pr-3 align-top">
              {href ? (
                <Link href={href(o.id)} className="text-sm font-medium hover:text-brand hover:underline">
                  {o.title}
                </Link>
              ) : (
                <span className="text-sm font-medium">{o.title}</span>
              )}
              <div className="text-xs text-text-3">{o.category}</div>
            </td>
            <td className="whitespace-nowrap py-2.5 text-right align-top text-sm text-success">
              {moneyShort(o.impactLow, currency)}–{moneyShort(o.impactHigh, currency)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run to verify it passes + typecheck**

Run: `npx vitest run components/report/RankedOpportunityTable.test.tsx && npx tsc --noEmit`
Expected: PASS (1 test), tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add components/report/RankedOpportunityTable.tsx components/report/RankedOpportunityTable.test.tsx
git commit -m "feat(report): RankedOpportunityTable — compact ranked list"
```

---

## Task 6: `OpportunitiesSection`

**Files:**
- Create: `components/report/OpportunitiesSection.tsx`
- Create: `components/report/OpportunitiesSection.test.tsx`

- [ ] **Step 1: Write the failing test `components/report/OpportunitiesSection.test.tsx`**

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OpportunitiesSection } from "./OpportunitiesSection";
import type { Opportunity } from "@/lib/types";
import type { WorkflowMapView } from "@/services/synthesis/workflows/types";

const opp = (id: string, n: number, title: string): Opportunity =>
  ({ id, compositeScore: n, title, impactLow: 10000, impactHigh: 20000, category: "Ops", horizon: "standard", departments: [], delivery: "build", confidenceScore: 4, dimensionScores: [], evidence: [], contributorCount: 3, rationale: "", description: "", impactHighFmt: "" }) as unknown as Opportunity;
const opps = [opp("o1", 6.7, "First"), opp("o2", 6.5, "Second"), opp("o3", 6.0, "Third"), opp("o4", 5.2, "Fourth")];
const matrix: WorkflowMapView = {
  id: "mx", kind: "impact_effort", title: "Impact vs. effort", basedOnSessions: 0,
  graph: { kind: "impact_effort", title: "Impact vs. effort", lanes: [], steps: [{ id: "p0", label: "First", laneId: null, stepKind: "step", inferred: false, captureIds: [], metric: { x: 2, y: 90 } }], edges: [], confidence: { score: 1, coverage: 1, corroboratedCount: 1, disputedStepIds: [] }, modelVersion: "pure-ts" },
  confidence: { score: 1, coverage: 1, corroboratedCount: 1, disputedStepIds: [] }, evidence: [],
};

describe("OpportunitiesSection", () => {
  it("renders the matrix overview, the top 3, and the rest as a table", () => {
    render(<OpportunitiesSection opps={opps} maps={[matrix]} currency="EUR" href={(id) => `/o/${id}`} />);
    expect(document.querySelector("svg")).not.toBeNull(); // matrix overview
    expect(screen.getByText("First")).toBeTruthy();
    expect(screen.getByText("Fourth")).toBeTruthy(); // in the table
  });
  it("shows an empty state with no opportunities", () => {
    render(<OpportunitiesSection opps={[]} maps={[]} currency="EUR" />);
    expect(screen.getByText(/No opportunities surfaced yet/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/report/OpportunitiesSection.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `components/report/OpportunitiesSection.tsx`**

```typescript
import { OpportunityCard } from "@/components/opportunity/OpportunityCard";
import { WorkflowDiagram } from "@/components/workflow/WorkflowDiagram";
import { RankedOpportunityTable } from "./RankedOpportunityTable";
import type { Opportunity } from "@/lib/types";
import type { Currency } from "@/lib/format";
import type { WorkflowMapView } from "@/services/synthesis/workflows/types";

/** Opportunities: matrix overview → top-3 elevated cards → compact ranked table. */
export function OpportunitiesSection({
  opps,
  maps,
  currency,
  href,
}: {
  opps: Opportunity[];
  maps: WorkflowMapView[];
  currency: Currency;
  href?: (id: string) => string;
}) {
  const matrix = maps.find((m) => m.kind === "impact_effort");
  const top = opps.slice(0, 3);
  const rest = opps.slice(3);

  return (
    <section className="mb-10">
      <h2 className="mb-2 text-2xl font-semibold tracking-tight">Opportunities</h2>
      {opps.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-text-3">
          No opportunities surfaced yet. They appear here as Atlas extracts and scores captures from completed sessions.
        </p>
      ) : (
        <>
          <p className="mb-4 text-md leading-relaxed text-text-2">
            {opps.length} surfaced, ranked by composite score. The top three are the place to start.
          </p>
          {matrix ? (
            <figure className="not-prose mb-6 rounded-lg border border-border bg-surface p-4">
              <figcaption className="mb-2 text-sm font-medium text-text">Impact vs. effort</figcaption>
              <WorkflowDiagram graph={matrix.graph} instanceId={matrix.id} />
              <ol className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-text-2">
                {matrix.graph.steps.map((s, i) => (
                  <li key={s.id}>{i + 1}. {s.label}</li>
                ))}
              </ol>
            </figure>
          ) : null}
          <div className="not-prose space-y-3">
            {top.map((o, i) => (
              <OpportunityCard key={o.id} opp={o} href={href?.(o.id)} rank={i + 1} meta="category" currency={currency} />
            ))}
          </div>
          {rest.length > 0 ? (
            <div className="not-prose mt-4">
              <RankedOpportunityTable opps={rest} currency={currency} startRank={top.length + 1} href={href} />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run to verify it passes + typecheck**

Run: `npx vitest run components/report/OpportunitiesSection.test.tsx && npx tsc --noEmit`
Expected: PASS (2 tests), tsc exit 0. If `OpportunityCard`'s prop types reject the test's partial `opp`, that's a test-only cast — keep the `as unknown as Opportunity`; the component itself only needs the real shape at runtime.

- [ ] **Step 5: Commit**

```bash
git add components/report/OpportunitiesSection.tsx components/report/OpportunitiesSection.test.tsx
git commit -m "feat(report): OpportunitiesSection — matrix overview + top 3 + table"
```

---

## Task 7: `RoadmapSection` + `StickyDecisionBar`, then recompose `ReportArticle`

**Files:**
- Create: `components/report/RoadmapSection.tsx`
- Create: `components/report/StickyDecisionBar.tsx`
- Create: `components/report/RoadmapSection.test.tsx`
- Create: `components/report/StickyDecisionBar.test.tsx`
- Modify: `components/report/ReportArticle.tsx`
- Modify: `app/(app)/sprint/[id]/report/page.tsx`

- [ ] **Step 1: Write `RoadmapSection.tsx` (extract the existing roadmap)**

```typescript
import { Check } from "lucide-react";
import type { Opportunity } from "@/lib/types";

function Column({ title, caption, items, empty }: { title: string; caption: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h3 className="text-md font-semibold">{title}</h3>
      <p className="mb-3 text-xs text-text-3">{caption}</p>
      {items.length === 0 ? (
        <p className="text-sm text-text-3">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it} className="flex items-start gap-2 text-sm text-text-2">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
              {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Suggested roadmap, sequenced left→right by funding horizon. */
export function RoadmapSection({ opps }: { opps: Opportunity[] }) {
  const quickWins = opps.filter((o) => o.horizon === "quick_win").map((o) => o.title);
  const strategicBets = opps.filter((o) => o.horizon === "strategic_bet").map((o) => o.title);
  const solidBets = opps.filter((o) => o.horizon !== "quick_win" && o.horizon !== "strategic_bet").map((o) => o.title);
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-2xl font-semibold tracking-tight">Suggested roadmap</h2>
      <div className="not-prose grid gap-4 sm:grid-cols-3">
        <Column title="Quick wins" caption="Fast, standalone, low-disruption" items={quickWins} empty="Short-cycle fixes land here as they surface." />
        <Column title="Solid bets" caption="Clear value, standard delivery" items={solidBets} empty="Ranked opportunities land here as they surface." />
        <Column title="Strategic bets" caption="High impact, bigger lift" items={strategicBets} empty="Larger, higher-impact plays land here." />
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Write `StickyDecisionBar.tsx`**

```typescript
import Link from "next/link";
import { moneyShort, type Currency } from "@/lib/format";
import type { Opportunity } from "@/lib/types";

/**
 * Slim sticky bar keeping the recommended move + CTA visible on scroll.
 * Slice-1 stand-in; Slice 2 migrates this into the drill-down sidebar.
 */
export function StickyDecisionBar({
  opps,
  currency,
  opportunityHref,
  isSponsor = false,
}: {
  opps: Opportunity[];
  currency: Currency;
  opportunityHref?: (id: string) => string;
  isSponsor?: boolean;
}) {
  const top = opps[0];
  if (!top || !opportunityHref) return null;
  const totalLow = opps.slice(0, 5).reduce((s, o) => s + o.impactLow, 0);
  return (
    <div
      data-print-hide
      className="sticky top-0 z-30 -mx-6 mb-6 flex items-center justify-between gap-3 border-b border-border bg-bg/85 px-6 py-2.5 backdrop-blur"
    >
      <div className="min-w-0 text-sm">
        <span className="font-semibold">{moneyShort(totalLow, currency)}+/yr</span>{" "}
        <span className="text-text-3">· start with</span>{" "}
        <span className="truncate font-medium">{top.title}</span>
      </div>
      <Link
        href={opportunityHref(top.id)}
        className="shrink-0 rounded-md bg-brand px-3.5 py-1.5 text-sm font-medium text-white hover:bg-brand-hover"
      >
        {isSponsor ? "Approve →" : "Review →"}
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Write the failing tests**

`components/report/RoadmapSection.test.tsx`:
```typescript
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RoadmapSection } from "./RoadmapSection";
import type { Opportunity } from "@/lib/types";

const o = (title: string, horizon: string): Opportunity => ({ id: title, title, horizon } as unknown as Opportunity);

describe("RoadmapSection", () => {
  it("buckets opportunities by horizon", () => {
    render(<RoadmapSection opps={[o("QW", "quick_win"), o("SB", "strategic_bet"), o("MID", "standard")]} />);
    expect(screen.getByText("QW")).toBeTruthy();
    expect(screen.getByText("SB")).toBeTruthy();
    expect(screen.getByText("MID")).toBeTruthy();
  });
});
```

`components/report/StickyDecisionBar.test.tsx`:
```typescript
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StickyDecisionBar } from "./StickyDecisionBar";
import type { Opportunity } from "@/lib/types";

const opps = [{ id: "o1", title: "Top move", impactLow: 56000, impactHigh: 75000 } as unknown as Opportunity];

describe("StickyDecisionBar", () => {
  it("renders the top move + CTA when a link is given", () => {
    render(<StickyDecisionBar opps={opps} currency="EUR" opportunityHref={(id) => `/o/${id}`} isSponsor />);
    expect(screen.getByText("Top move")).toBeTruthy();
    expect(screen.getByRole("link", { name: /approve/i })).toBeTruthy();
  });
  it("renders nothing without a link (read-only view)", () => {
    const { container } = render(<StickyDecisionBar opps={opps} currency="EUR" />);
    expect(container.textContent).toBe("");
  });
});
```

- [ ] **Step 4: Run the two new tests to verify they fail**

Run: `npx vitest run components/report/RoadmapSection.test.tsx components/report/StickyDecisionBar.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 5: Run them to verify they pass** (the implementations from Steps 1–2 already exist)

Run: `npx vitest run components/report/RoadmapSection.test.tsx components/report/StickyDecisionBar.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Recompose `components/report/ReportArticle.tsx`**

Replace the whole file with the new IA composition (keep the local `Section` for the demoted methodology/closing prose; drop the old cover/exec-summary/ranked/workflow/roadmap inline blocks and the old `RoadmapColumn`):

```typescript
import { ReportExplainer } from "@/components/report/ReportExplainer";
import { ReportHero } from "@/components/report/ReportHero";
import { FindingsSection } from "@/components/report/FindingsSection";
import { OpportunitiesSection } from "@/components/report/OpportunitiesSection";
import { RoadmapSection } from "@/components/report/RoadmapSection";
import { StickyDecisionBar } from "@/components/report/StickyDecisionBar";
import type { Sprint, SprintProgress, Opportunity, SynthesisMemo } from "@/lib/types";
import type { WorkflowMapView } from "@/services/synthesis/workflows/types";

/**
 * The discovery report body, shared by the manager/sponsor report and the
 * Twistag read-only report. The page owns the toolbar + data fetch; this owns
 * the `<article>`. Pass `opportunityHref` to link opportunities (manager/sponsor
 * view) and `isSponsor` to label the CTA; omit both for the read-only view.
 */
export function ReportArticle({
  sprint,
  progress,
  opps,
  memo,
  workflowMaps = [],
  opportunityHref,
  isSponsor = false,
}: {
  sprint: Sprint;
  progress: SprintProgress;
  opps: Opportunity[];
  memo?: SynthesisMemo | null;
  workflowMaps?: WorkflowMapView[];
  opportunityHref?: (id: string) => string;
  isSponsor?: boolean;
}) {
  const currency = sprint.tenantCurrency;
  return (
    <article className="mx-auto max-w-3xl px-6 py-10">
      <StickyDecisionBar opps={opps} currency={currency} opportunityHref={opportunityHref} isSponsor={isSponsor} />

      <ReportHero
        sprint={sprint}
        progress={progress}
        opps={opps}
        currency={currency}
        opportunityHref={opportunityHref}
        isSponsor={isSponsor}
      />

      {memo && memo.openingNarrative ? (
        <Section title="In short">
          <p>{memo.openingNarrative}</p>
          {memo.recommendedNextStep ? (
            <p><strong>Recommended next step. </strong>{memo.recommendedNextStep}</p>
          ) : null}
        </Section>
      ) : null}

      <FindingsSection maps={workflowMaps} />

      <OpportunitiesSection opps={opps} maps={workflowMaps} currency={currency} href={opportunityHref} />

      <RoadmapSection opps={opps} />

      <Section title="How we got here">
        <p>
          Atlas runs discovery as conversation, not workshops. Each participant completed up to four short sessions on their own schedule. An extraction pass lifted concrete moments — bottlenecks, workarounds, handoffs — attributed to the contributor by name and role, then clustered and scored across five dimensions.
        </p>
      </Section>

      <Section title="What happens next">
        <p>
          Each opportunity links to its full evidence and a pre-drafted SOW. Approve one and the Twistag engagement team aligns scope within 48 hours; the first ship typically lands in 2–4 weeks.
        </p>
      </Section>

      <div className="mt-8"><ReportExplainer /></div>

      <footer className="mt-10 border-t border-border pt-6 text-xs text-text-3">
        Generated by Atlas · {sprint.startDate} – {sprint.endDate} · Built by Twistag. Quotes attributed to contributors by name and role.
      </footer>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-md leading-relaxed text-text-2 [&_strong]:font-semibold [&_strong]:text-text">
        {children}
      </div>
    </section>
  );
}
```

- [ ] **Step 7: Pass `isSponsor` from the report page**

In `app/(app)/sprint/[id]/report/page.tsx`, the page already computes `const isSponsor = session.role === "sponsor";`. Add `isSponsor={isSponsor}` to the `<ReportArticle .../>` props.

- [ ] **Step 8: Typecheck + run the full report component suite**

Run: `npx tsc --noEmit && npx vitest run components/report lib/report-hero.test.ts`
Expected: tsc exit 0; all report component + headline tests pass.

> If the Twistag read-only admin report (a different page) also renders `<ReportArticle>`, confirm it still compiles — the new props are optional, so it should. If it passed `progress={...}` etc. positionally, it's fine; only `isSponsor`/`opportunityHref` are new and optional.

- [ ] **Step 9: Commit**

```bash
git add components/report/RoadmapSection.tsx components/report/RoadmapSection.test.tsx components/report/StickyDecisionBar.tsx components/report/StickyDecisionBar.test.tsx components/report/ReportArticle.tsx "app/(app)/sprint/[id]/report/page.tsx"
git commit -m "feat(report): recompose ReportArticle into hero + findings + opportunities cockpit"
```

---

## Self-Review (completed during planning)

**Spec coverage (§6):**
- §6.1 IA order → Task 7 recompose (hero → in-short → findings → opportunities → roadmap → methodology/next).
- §6.2 hero (headline, metrics, recommended move + sponsor-gated CTA) → Tasks 1–2.
- §6.3 findings = promoted diagrams under headlines + evidence click-through → Tasks 3–4.
- §6.4 opportunities (matrix overview + top-3 + ranked table) → Tasks 5–6.
- §6.5 roadmap → Task 7.
- §6.6 decompose `ReportArticle` into focused components → all tasks; `StickyDecisionBar` is the Slice-1 decision-bar stand-in (spec §6.6) with a comment noting Slice 2 migrates it.
- The duplicate "How the work flows today" section is removed — those diagrams now live once, as findings (avoids the duplication the spec implied).

**Placeholder scan:** none. The Tailwind-token and OpportunityCard-prop notes are guarded verification steps, not vague directives.

**Type consistency:** `reportHeadline(opts)` signature identical in Tasks 1–2. `WorkflowMapView`, `Opportunity`, `SprintProgress`, `Sprint`, `Currency` used consistently. `instanceId` on `WorkflowDiagram` matches the marker-id fix already on main. `href`/`opportunityHref`/`isSponsor`/`startRank` names are consistent across components and the recompose. `FINDING_KINDS` excludes `impact_effort`, which `OpportunitiesSection` consumes — no overlap, no double-render.
