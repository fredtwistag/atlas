# Report Redesign — Slice 2: Drill-Down Sidebar Implementation Plan (2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing app sidebar drill into the report (Vercel-style): on the report page it shows a `‹ Overview` back, the report's section anchors with scroll-spy highlighting, and the recommended-move decision chip — content swapping in place of the flat sprint nav.

**Architecture:** A lightweight client **context** (`SidebarDrillProvider`) bridges page→layout: the report page registers a drill config (sections + decision), the layout-level `AppSidebar` consumes it and renders a drilled view instead of the flat persona nav. Scroll-spy via a small `useScrollSpy` hook (IntersectionObserver). The in-content `StickyDecisionBar` from Slice 1 is removed — its chip now lives in the drilled sidebar.

**Tech Stack:** Next.js 15 client components, React context, IntersectionObserver, Tailwind, vitest + jsdom + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-06-21-report-experience-redesign-design.md` (§7). **Slice 2 of 3.** Depends on Slice 1 (the report components + `StickyDecisionBar`) already on main. Deferred to a fast-follow (noted in spec §11): the deeper "Opportunities → individual opps" drill level and the in-place collapse-without-navigating back behavior; this slice's `‹` navigates to `/sprint`.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `lib/report-sections.ts` (+test) | `REPORT_SECTIONS` constant (id+label), shared by anchors + registrar | Create |
| `components/SidebarDrillContext.tsx` (+test) | Client context: `SidebarDrillProvider`, `useSidebarDrill`, config types | Create |
| `lib/use-scroll-spy.ts` (+test) | `useScrollSpy(ids)` — active section via IntersectionObserver | Create |
| `components/report/ReportSidebarRegistrar.tsx` (+test) | Client: registers the report's drill config on mount, clears on unmount | Create |
| `components/AppSidebar.tsx` | Render the drilled view when a config is present (else flat nav, unchanged) | Modify |
| `components/AppShell.tsx` | Wrap sidebar(s) + children in `SidebarDrillProvider` | Modify |
| `components/report/ReportArticle.tsx` | Add section-anchor `id`s; remove `StickyDecisionBar` (chip moved to sidebar) | Modify |
| `app/(app)/sprint/[id]/report/page.tsx` | Render `<ReportSidebarRegistrar>` with the config | Modify |

No barrel files. Co-locate tests. Component/hook tests use `// @vitest-environment jsdom` + `@testing-library/react`.

**Commands:** `npx vitest run <path>`; `npx tsc --noEmit`. Commit ONLY named files per task (`git add <files>`, never `-A`/`.` — unrelated WIP in the tree).

---

## Task 1: `REPORT_SECTIONS` constant

**Files:**
- Create: `lib/report-sections.ts`
- Create: `lib/report-sections.test.ts`

- [ ] **Step 1: Write the failing test `lib/report-sections.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { REPORT_SECTIONS } from "./report-sections";

describe("REPORT_SECTIONS", () => {
  it("lists the report's drillable sections with unique ids", () => {
    expect(REPORT_SECTIONS.map((s) => s.id)).toEqual(["summary", "findings", "opportunities", "roadmap"]);
    const ids = new Set(REPORT_SECTIONS.map((s) => s.id));
    expect(ids.size).toBe(REPORT_SECTIONS.length);
    expect(REPORT_SECTIONS.find((s) => s.id === "findings")?.label).toBe("What we found");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/report-sections.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `lib/report-sections.ts`**

```typescript
/** The report's drillable sections — shared by the in-page anchors
 * (ReportArticle) and the drill-down sidebar registrar. ids match DOM anchor ids. */
export interface ReportSection {
  id: string;
  label: string;
}

export const REPORT_SECTIONS: ReportSection[] = [
  { id: "summary", label: "Summary" },
  { id: "findings", label: "What we found" },
  { id: "opportunities", label: "Opportunities" },
  { id: "roadmap", label: "Roadmap" },
];
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/report-sections.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add lib/report-sections.ts lib/report-sections.test.ts
git commit -m "feat(report): REPORT_SECTIONS — shared drillable section list"
```

---

## Task 2: `SidebarDrillContext`

**Files:**
- Create: `components/SidebarDrillContext.tsx`
- Create: `components/SidebarDrillContext.test.tsx`

- [ ] **Step 1: Write the failing test `components/SidebarDrillContext.test.tsx`**

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SidebarDrillProvider, useSidebarDrill } from "./SidebarDrillContext";

function Probe() {
  const { config, setConfig } = useSidebarDrill();
  return (
    <div>
      <span data-testid="title">{config?.title ?? "none"}</span>
      <button onClick={() => setConfig({ backLabel: "Overview", backHref: "/sprint", title: "Report", sections: [], decision: null })}>
        set
      </button>
      <button onClick={() => setConfig(null)}>clear</button>
    </div>
  );
}

describe("SidebarDrillContext", () => {
  it("starts null and round-trips a config through the provider", () => {
    render(<SidebarDrillProvider><Probe /></SidebarDrillProvider>);
    expect(screen.getByTestId("title").textContent).toBe("none");
    fireEvent.click(screen.getByText("set"));
    expect(screen.getByTestId("title").textContent).toBe("Report");
    fireEvent.click(screen.getByText("clear"));
    expect(screen.getByTestId("title").textContent).toBe("none");
  });
  it("useSidebarDrill outside a provider is a safe no-op (default null)", () => {
    render(<Probe />);
    expect(screen.getByTestId("title").textContent).toBe("none");
    fireEvent.click(screen.getByText("set")); // no provider — setConfig is a no-op
    expect(screen.getByTestId("title").textContent).toBe("none");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/SidebarDrillContext.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `components/SidebarDrillContext.tsx`**

```typescript
"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export interface SidebarDrillDecision {
  moneyLabel: string;
  oppTitle: string;
  href: string;
  ctaLabel: string;
}

export interface SidebarDrillConfig {
  backLabel: string;
  backHref: string;
  title: string;
  sections: { id: string; label: string }[];
  decision?: SidebarDrillDecision | null;
}

interface DrillContext {
  config: SidebarDrillConfig | null;
  setConfig: (config: SidebarDrillConfig | null) => void;
}

const Ctx = createContext<DrillContext>({ config: null, setConfig: () => {} });

/** Bridges a page's report-nav config up to the layout-level sidebar. */
export function SidebarDrillProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<SidebarDrillConfig | null>(null);
  const setConfig = useCallback((c: SidebarDrillConfig | null) => setConfigState(c), []);
  return <Ctx.Provider value={{ config, setConfig }}>{children}</Ctx.Provider>;
}

export function useSidebarDrill(): DrillContext {
  return useContext(Ctx);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/SidebarDrillContext.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/SidebarDrillContext.tsx components/SidebarDrillContext.test.tsx
git commit -m "feat(sidebar): SidebarDrill context — page→layout nav bridge"
```

---

## Task 3: `useScrollSpy`

**Files:**
- Create: `lib/use-scroll-spy.ts`
- Create: `lib/use-scroll-spy.test.tsx`

- [ ] **Step 1: Write the failing test `lib/use-scroll-spy.test.tsx`**

```typescript
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useScrollSpy } from "./use-scroll-spy";

let lastCallback: ((entries: unknown[]) => void) | null = null;
class MockIO {
  constructor(cb: (entries: unknown[]) => void) {
    lastCallback = cb;
  }
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  lastCallback = null;
  vi.stubGlobal("IntersectionObserver", MockIO as unknown as typeof IntersectionObserver);
});

function Probe({ ids }: { ids: string[] }) {
  const active = useScrollSpy(ids);
  return <span data-testid="active">{active ?? "none"}</span>;
}

describe("useScrollSpy", () => {
  it("defaults to the first id, then tracks the intersecting section", () => {
    render(
      <>
        <div id="a" /><div id="b" />
        <Probe ids={["a", "b"]} />
      </>,
    );
    expect(screen.getByTestId("active").textContent).toBe("a");
    act(() => {
      lastCallback?.([{ isIntersecting: true, target: { id: "b" }, boundingClientRect: { top: 10 } }]);
    });
    expect(screen.getByTestId("active").textContent).toBe("b");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/use-scroll-spy.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `lib/use-scroll-spy.ts`**

```typescript
"use client";

import { useEffect, useState } from "react";

/**
 * Returns the id of the report section currently in the reading band, for
 * sidebar scroll-spy highlighting. Defaults to the first id before any scroll.
 */
export function useScrollSpy(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  const key = ids.join(",");

  useEffect(() => {
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return active;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/use-scroll-spy.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add lib/use-scroll-spy.ts lib/use-scroll-spy.test.tsx
git commit -m "feat(report): useScrollSpy — active section via IntersectionObserver"
```

---

## Task 4: `ReportSidebarRegistrar`

**Files:**
- Create: `components/report/ReportSidebarRegistrar.tsx`
- Create: `components/report/ReportSidebarRegistrar.test.tsx`

- [ ] **Step 1: Write the failing test `components/report/ReportSidebarRegistrar.test.tsx`**

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SidebarDrillProvider, useSidebarDrill } from "@/components/SidebarDrillContext";
import { ReportSidebarRegistrar } from "./ReportSidebarRegistrar";
import { REPORT_SECTIONS } from "@/lib/report-sections";

function Peek() {
  const { config } = useSidebarDrill();
  return <span data-testid="peek">{config ? `${config.title}:${config.sections.length}:${config.decision?.ctaLabel ?? "-"}` : "none"}</span>;
}

describe("ReportSidebarRegistrar", () => {
  it("registers the report drill config (title, sections, decision) into the context", () => {
    render(
      <SidebarDrillProvider>
        <ReportSidebarRegistrar
          config={{ backLabel: "Overview", backHref: "/sprint", title: "Report", sections: REPORT_SECTIONS, decision: { moneyLabel: "€190K+/yr", oppTitle: "Top move", href: "/o/1", ctaLabel: "Approve →" } }}
        />
        <Peek />
      </SidebarDrillProvider>,
    );
    expect(screen.getByTestId("peek").textContent).toBe("Report:4:Approve →");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/report/ReportSidebarRegistrar.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `components/report/ReportSidebarRegistrar.tsx`**

```typescript
"use client";

import { useEffect } from "react";
import { useSidebarDrill, type SidebarDrillConfig } from "@/components/SidebarDrillContext";

/**
 * Registers the report's drill config into the sidebar context on mount and
 * clears it on unmount (so navigating away restores the flat nav). Renders
 * nothing. The report page builds the config (sections + the recommended move).
 */
export function ReportSidebarRegistrar({ config }: { config: SidebarDrillConfig }) {
  const { setConfig } = useSidebarDrill();
  const key = JSON.stringify(config);
  useEffect(() => {
    setConfig(config);
    return () => setConfig(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setConfig, key]);
  return null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/report/ReportSidebarRegistrar.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add components/report/ReportSidebarRegistrar.tsx components/report/ReportSidebarRegistrar.test.tsx
git commit -m "feat(report): ReportSidebarRegistrar — register report drill config"
```

---

## Task 5: `AppSidebar` drilled view

**Files:**
- Modify: `components/AppSidebar.tsx`
- Create: `components/AppSidebar.test.tsx`

- [ ] **Step 1: Write the failing test `components/AppSidebar.test.tsx`**

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/sprint/x/report" }));
vi.mock("@/app/sign-in/actions", () => ({ signOut: () => {} }));

import { AppSidebar } from "./AppSidebar";
import { SidebarDrillProvider, useSidebarDrill, type SidebarDrillConfig } from "./SidebarDrillContext";

const config: SidebarDrillConfig = {
  backLabel: "Overview",
  backHref: "/sprint",
  title: "Report",
  sections: [{ id: "findings", label: "What we found" }, { id: "opportunities", label: "Opportunities" }],
  decision: { moneyLabel: "€190K+/yr", oppTitle: "Automate close", href: "/o/1", ctaLabel: "Approve →" },
};

function Seed({ config: c }: { config: SidebarDrillConfig | null }) {
  const { setConfig } = useSidebarDrill();
  setConfig(c); // set synchronously for the test
  return null;
}

const user = { name: "Vera", title: "Sponsor" };

describe("AppSidebar drill-down", () => {
  it("renders the drilled view (back, decision chip, section anchors) when a config is present", () => {
    render(
      <SidebarDrillProvider>
        <Seed config={config} />
        <AppSidebar user={user} userKind="tenant" sprintId="x" />
      </SidebarDrillProvider>,
    );
    expect(screen.getByText(/Overview/)).toBeTruthy(); // back label
    expect(screen.getByText("What we found")).toBeTruthy(); // section anchor
    expect(screen.getByText("Automate close")).toBeTruthy(); // decision chip
    expect(screen.getByRole("link", { name: /Approve/ })).toBeTruthy();
    const anchor = screen.getByText("What we found").closest("a");
    expect(anchor?.getAttribute("href")).toBe("#findings");
  });
  it("renders the flat persona nav when no config is present", () => {
    render(
      <SidebarDrillProvider>
        <AppSidebar user={user} userKind="tenant" sprintId="x" />
      </SidebarDrillProvider>,
    );
    expect(screen.getByText("Participants")).toBeTruthy(); // flat manager nav
  });
});
```

> Note: `<Seed>` calls `setConfig` during render (acceptable for this test). If React warns, wrap it in a `useEffect` and `await screen.findByText(...)` instead.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/AppSidebar.test.tsx`
Expected: FAIL (drilled view not implemented — "What we found" / back label absent).

- [ ] **Step 3: Add the drilled view to `components/AppSidebar.tsx`**

Add imports near the top:

```typescript
import { ChevronLeft } from "lucide-react";
import { useSidebarDrill } from "./SidebarDrillContext";
import { useScrollSpy } from "@/lib/use-scroll-spy";
```

Inside `AppSidebar`, after `const pathname = usePathname();`, read the drill config and compute the active section:

```typescript
  const { config: drill } = useSidebarDrill();
  const activeSection = useScrollSpy(drill ? drill.sections.map((s) => s.id) : []);
```

Then, immediately before the existing `return (` for the flat nav, add an early drilled-view return:

```typescript
  if (drill) {
    return (
      <div className="flex h-full flex-col">
        <div className="px-4 pb-3 pt-4">
          <Logo />
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
          <Link
            href={drill.backHref}
            onClick={onNavigate}
            className="flex items-center gap-1.5 px-2 py-1 text-sm font-medium text-text-2 hover:text-text"
          >
            <ChevronLeft className="h-4 w-4" />
            {drill.backLabel}
          </Link>

          {drill.decision ? (
            <Link
              href={drill.decision.href}
              onClick={onNavigate}
              className="block rounded-md bg-accent-blue-soft p-3 hover:bg-accent-blue-soft/70"
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-accent-blue-text">
                {drill.decision.moneyLabel}
              </div>
              <div className="mt-0.5 truncate text-[13px] font-medium text-text">
                {drill.decision.oppTitle}
              </div>
              <div className="mt-1.5 text-xs font-medium text-accent-blue-text">
                {drill.decision.ctaLabel}
              </div>
            </Link>
          ) : null}

          <div className="space-y-1">
            <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-3">
              {drill.title}
            </div>
            {drill.sections.map((s) => {
              const isActive = s.id === activeSection;
              return (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  onClick={onNavigate}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    rowBase,
                    isActive
                      ? "bg-surface-2 text-text"
                      : "text-text-2 hover:bg-surface-2 hover:text-text",
                  )}
                >
                  <span className="flex-1 truncate">{s.label}</span>
                </a>
              );
            })}
          </div>
        </nav>

        <div className="mt-auto flex items-center gap-2.5 border-t border-border px-4 py-3">
          <Avatar name={user.name} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-medium leading-tight">{user.name}</div>
            <div className="truncate text-xs text-text-3">{user.title}</div>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              onClick={onNavigate}
              aria-label="Sign out"
              title="Sign out"
              className="rounded-sm p-1.5 text-text-3 transition-colors hover:bg-surface-2 hover:text-text"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    );
  }
```

> `rowBase` is the existing const defined above the return. The drilled footer duplicates the existing user-footer markup intentionally (keeps the early-return self-contained). Do NOT change the existing flat-nav return below.

- [ ] **Step 4: Run to verify it passes + typecheck**

Run: `npx vitest run components/AppSidebar.test.tsx && npx tsc --noEmit`
Expected: PASS (2 tests), tsc exit 0. If `bg-accent-blue-soft/70` opacity syntax is rejected, drop the `/70` (use `hover:bg-accent-blue-soft`).

- [ ] **Step 5: Commit**

```bash
git add components/AppSidebar.tsx components/AppSidebar.test.tsx
git commit -m "feat(sidebar): drilled report view (back + decision chip + scroll-spy sections)"
```

---

## Task 6: Wire the provider, anchors, registrar; remove StickyDecisionBar

**Files:**
- Modify: `components/AppShell.tsx`
- Modify: `components/report/ReportArticle.tsx`
- Modify: `app/(app)/sprint/[id]/report/page.tsx`

- [ ] **Step 1: Wrap `AppShell` content in the provider**

In `components/AppShell.tsx`, add the import and wrap the outer `<div>`'s children:

```typescript
import { SidebarDrillProvider } from "./SidebarDrillContext";
```

Wrap the returned tree: put `<SidebarDrillProvider>` immediately inside the root `<div className="min-h-screen ...">` so it encloses BOTH the desktop rail, the mobile bar/drawer, AND the content column. (Open the tag right after the root `<div ...>` and close it right before that div closes.)

- [ ] **Step 2: Add section anchors + remove `StickyDecisionBar` in `ReportArticle.tsx`**

Remove the `StickyDecisionBar` import and its render line. Wrap each composed section in an anchor div whose id matches `REPORT_SECTIONS`. The hero is `summary`; the others map to their components. Add `className="scroll-mt-20"` so anchored scrolling clears any sticky chrome:

```typescript
// remove: import { StickyDecisionBar } from "@/components/report/StickyDecisionBar";
// remove: the <StickyDecisionBar .../> element

// wrap sections (inside the <article>):
<div id="summary" className="scroll-mt-20">
  <ReportHero sprint={sprint} progress={progress} opps={opps} currency={currency} opportunityHref={opportunityHref} isSponsor={isSponsor} />
</div>

{/* keep the "In short" memo block as-is */}

<div id="findings" className="scroll-mt-20">
  <FindingsSection maps={workflowMaps} />
</div>

<div id="opportunities" className="scroll-mt-20">
  <OpportunitiesSection opps={opps} maps={workflowMaps} currency={currency} href={opportunityHref} />
</div>

<div id="roadmap" className="scroll-mt-20">
  <RoadmapSection opps={opps} />
</div>
```

Keep the rest (memo "In short", "How we got here", "What happens next", ReportExplainer, footer) unchanged.

- [ ] **Step 3: Render the registrar from the report page**

In `app/(app)/sprint/[id]/report/page.tsx`, build the drill config and render `<ReportSidebarRegistrar>` inside the returned tree (it renders null, place it near the top of the page's JSX). Use the already-fetched `opps`, `isSponsor`, and the `opportunityHref` pattern (`/sprint/${id}/opportunity/${oid}`):

```typescript
import { ReportSidebarRegistrar } from "@/components/report/ReportSidebarRegistrar";
import { REPORT_SECTIONS } from "@/lib/report-sections";
import { moneyShort } from "@/lib/format";
```

```tsx
  const top = opps[0];
  const totalLow = opps.slice(0, 5).reduce((s, o) => s + o.impactLow, 0);
  const drillConfig = {
    backLabel: "Overview",
    backHref: "/sprint",
    title: "Report",
    sections: REPORT_SECTIONS,
    decision: top
      ? {
          moneyLabel: `${moneyShort(totalLow, sprint.tenantCurrency)}+/yr`,
          oppTitle: top.title,
          href: `/sprint/${id}/opportunity/${top.id}`,
          ctaLabel: isSponsor ? "Approve →" : "Review →",
        }
      : null,
  };
```

Render `<ReportSidebarRegistrar config={drillConfig} />` just inside the page's returned root element (before `<ReportArticle ...>`).

> This is a server component rendering a client component — fine. `ReportSidebarRegistrar` is `"use client"`.

- [ ] **Step 4: Typecheck + run the report + sidebar suites**

Run: `npx tsc --noEmit && npx vitest run components/report components/AppSidebar.test.tsx components/SidebarDrillContext.test.tsx lib/report-sections.test.ts lib/use-scroll-spy.test.tsx`
Expected: tsc exit 0; all pass. (The Slice-1 `StickyDecisionBar.test.tsx` still passes — the component file remains; it's just no longer rendered by ReportArticle.)

- [ ] **Step 5: Verify in the browser (controller does this)**

The implementer SKIPS browser verification. The controller signs in as the Vizta sponsor, opens the report, and confirms: the sidebar shows `‹ Overview` + the decision chip + the section list; scrolling highlights the active section; clicking a section scrolls to it; the in-content sticky bar is gone.

- [ ] **Step 6: Commit**

```bash
git add components/AppShell.tsx components/report/ReportArticle.tsx "app/(app)/sprint/[id]/report/page.tsx"
git commit -m "feat(report): drill-down sidebar — provider, anchors, registrar; drop in-content sticky bar"
```

---

## Self-Review (completed during planning)

**Spec coverage (§7):**
- §7.1 drill behavior (drilled report view with `‹` back + sections, content swapping) → Tasks 5–6. The deeper "Opportunities → individual opps" level and in-place collapse are explicitly deferred (spec §11) — `‹` navigates to `/sprint`.
- §7.2 model/state: URL-independent client context registered by the report page (works because the registrar only mounts on the report page) → Tasks 2, 4, 6. Scroll-spy via IntersectionObserver → Task 3. Decision chip migrated from the in-content `StickyDecisionBar` into the drilled sidebar → Tasks 5–6 (StickyDecisionBar render removed).
- §7.3 accessibility: `‹` back is a real link, section anchors carry `aria-current`, drilled list keyboard-navigable (anchors).

**Placeholder scan:** none. The `<Seed>`-during-render note and the `/70` opacity fallback are guarded alternatives, not vague directives.

**Type consistency:** `SidebarDrillConfig`/`SidebarDrillDecision` defined once (Task 2), consumed by the registrar (Task 4), the sidebar (Task 5), and the page (Task 6). `REPORT_SECTIONS` (Task 1) feeds both the anchors (Task 6 `ReportArticle`) and the registrar config (Task 6 page) — the ids match the DOM anchor ids, which `useScrollSpy` observes. `useSidebarDrill`/`SidebarDrillProvider`/`useScrollSpy` names consistent across tasks.

**Cross-slice:** removes the Slice-1 `StickyDecisionBar` from `ReportArticle` (its file/tests stay green but it's no longer rendered) — the chip is now the sidebar's. The Twistag read-only admin report registers no config → flat nav, unchanged.
