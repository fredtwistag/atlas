# Front-end Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the Atlas Next.js front-end (quality gates, shared components, async data seam, fonts/metadata/a11y, tests) before any backend is plumbed in, so the backend phase starts on a clean, conventional foundation.

**Architecture:** Six dependency-ordered waves. Safety net (lint/test/CI) lands first so every later change is guarded; then token single-source-of-truth, shared primitives (pure refactor), async data seam + loading/error boundaries, fonts/metadata/a11y, and finally the test fill-in. Behaviour and visuals are preserved except the WCAG-AA muted-text contrast fix.

**Tech Stack:** Next.js 15.1.6 (App Router), React 19, TypeScript (strict), Tailwind v3, Vitest 4 + React Testing Library 16 + jsdom, Zod 4, ESLint (next/core-web-vitals) + Prettier, GitHub Actions.

**Branch:** `frontend-hardening` (already created, off `main`). The design spec lives at `docs/superpowers/specs/2026-06-09-frontend-hardening-design.md`.

**Conventions for every task:** strict TS (no `any`), functional components, no barrel files, co-located tests (`foo.tsx` + `foo.test.tsx`), direct imports via the `@/` alias. After each task, the build and tests must stay green.

---

## File map

**New files**
- `.eslintrc.json`, `.prettierrc`, `.prettierignore`, `.nvmrc`, `.env.example`
- `vitest.config.ts`, `vitest.setup.ts`
- `.github/workflows/ci.yml`
- `lib/ui-maps.ts` (+ `.test.ts`)
- `lib/session.ts`
- `lib/schemas.ts` (+ `.test.ts`)
- `app/fonts.ts`
- `app/robots.ts`, `app/sitemap.ts`
- `components/ui/StatCard.tsx` (+ `.test.tsx`)
- `components/ui/BackLink.tsx`
- `components/ui/Sheet.tsx` (+ `.test.tsx`)
- `components/opportunity/OpportunityCard.tsx`
- `app/(app)/loading.tsx`, `app/(app)/error.tsx`
- `app/(app)/sprint/[id]/loading.tsx`
- `app/(app)/sprint/[id]/opportunity/[oppId]/loading.tsx`
- Unit tests: `components/ui/Button.test.tsx`, `Badge.test.tsx`, `ProgressBar.test.tsx`, `components/ScoreBadge.test.tsx`, `components/session/ConversationView.test.tsx`, `components/opportunity/OpportunityDetail.test.tsx`

**Modified files**
- `package.json` (scripts, deps, engines), `next.config.mjs` (drop `ignoreDuringBuilds`)
- `tailwind.config.js` (spread design theme), `app/globals.css` (import design tokens)
- `design/tokens.css` (AA muted-text value)
- `lib/data.ts` (async), `lib/types.ts` (unchanged shapes; types may be re-derived in schemas)
- Consumers of the new primitives/maps: `app/(app)/sprint/[id]/page.tsx`, `app/(app)/twistag/page.tsx`, `app/(app)/sprint/[id]/opportunity/[oppId]/page.tsx`, `app/(app)/sprint/[id]/report/page.tsx`, `app/(app)/me/page.tsx`, `app/(app)/me/sessions/[id]/edit/page.tsx`, `app/(app)/sprint/[id]/nudge/[participantId]/page.tsx`, `app/(app)/session/[id]/page.tsx`, `app/(app)/layout.tsx`, `app/layout.tsx`, `app/(marketing)/page.tsx`
- Feature components: `components/opportunity/OpportunityDetail.tsx`, `components/session/ConversationView.tsx`, `components/AppHeader.tsx`

---

# Wave 1 — Safety net & quality gates

### Task 1: ESLint + Prettier configuration

**Files:**
- Create: `.eslintrc.json`, `.prettierrc`, `.prettierignore`
- Modify: `package.json` (scripts + devDeps)

- [ ] **Step 1: Install Prettier + eslint-config-prettier**

Run:
```bash
npm install -D prettier@^3.8.3 eslint-config-prettier@^10.1.8
```

- [ ] **Step 2: Create `.eslintrc.json`**

```json
{
  "extends": ["next/core-web-vitals", "next/typescript", "prettier"],
  "rules": {
    "@typescript-eslint/no-unused-vars": [
      "error",
      { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }
    ]
  },
  "ignorePatterns": ["prototypes/**", ".next/**", "node_modules/**"]
}
```

- [ ] **Step 3: Create `.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 80
}
```

- [ ] **Step 4: Create `.prettierignore`**

```
.next
node_modules
prototypes
package-lock.json
*.md
```

- [ ] **Step 5: Add scripts to `package.json`**

In `"scripts"`, add:
```json
"format": "prettier --write .",
"format:check": "prettier --check ."
```

- [ ] **Step 6: Install the Next.js lint dependency set, then run lint**

`next lint` may need `eslint` config bootstrapping; the `.eslintrc.json` above pre-empts the prompt. Run:
```bash
npm run lint
```
Expected: completes. Fix any reported errors (most likely unescaped entities or unused imports). Re-run until clean.

- [ ] **Step 7: Commit**

```bash
git add .eslintrc.json .prettierrc .prettierignore package.json package-lock.json
git commit -m "chore: add eslint + prettier config and scripts"
```

---

### Task 2: Vitest + React Testing Library setup

**Files:**
- Create: `vitest.config.ts`, `vitest.setup.ts`, `components/ui/Badge.test.tsx` (smoke test to prove the harness)
- Modify: `package.json` (scripts + devDeps)

- [ ] **Step 1: Install test tooling**

Run:
```bash
npm install -D vitest@^4.1.8 @vitejs/plugin-react@^6.0.2 jsdom@^29.1.1 vite-tsconfig-paths@^6.1.1 @testing-library/react@^16.3.2 @testing-library/jest-dom@^6.9.1 @testing-library/user-event@^14.6.1
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "prototypes"],
  },
});
```

- [ ] **Step 3: Create `vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 4: Add test scripts to `package.json`**

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Write a smoke test — `components/ui/Badge.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders its children", () => {
    render(<Badge tone="success">Done</Badge>);
    expect(screen.getByText("Done")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the test**

Run: `npm test`
Expected: 1 passed. (Confirms jsdom + RTL + `@/` alias + JSX transform all work.)

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts vitest.setup.ts components/ui/Badge.test.tsx package.json package-lock.json
git commit -m "chore: add vitest + react testing library harness"
```

---

### Task 3: Node version + env example

**Files:**
- Create: `.nvmrc`, `.env.example`
- Modify: `package.json` (engines)

- [ ] **Step 1: Create `.nvmrc`**

```
22
```

- [ ] **Step 2: Add `engines` to `package.json`**

Top-level, after `"private": true`:
```json
"engines": { "node": ">=22" },
```

- [ ] **Step 3: Create `.env.example`** (documents the backend phase's vars; all commented, no values)

```bash
# ──────────────────────────────────────────────────────────────
# Atlas environment — copy to .env.local and fill in for backend work.
# The demo app runs with NONE of these set (data is in-memory).
# ──────────────────────────────────────────────────────────────

# Supabase (Postgres + RLS + storage) — docs/02-architecture.md §3
# NEXT_PUBLIC_SUPABASE_URL=
# NEXT_PUBLIC_SUPABASE_ANON_KEY=
# SUPABASE_SERVICE_ROLE_KEY=

# Stytch magic-link auth — docs/02-architecture.md §5.1
# STYTCH_PROJECT_ID=
# STYTCH_SECRET=

# Anthropic (Claude) — services/llm
# ANTHROPIC_API_KEY=

# Resend (email)
# RESEND_API_KEY=

# Inngest (workers)
# INNGEST_EVENT_KEY=
# INNGEST_SIGNING_KEY=
```

- [ ] **Step 4: Commit**

```bash
git add .nvmrc .env.example package.json
git commit -m "chore: pin node version and document env vars"
```

---

### Task 4: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

- [ ] **Step 2: Verify the four gate commands pass locally** (CI mirrors these)

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all succeed.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run typecheck, lint, test, build on push and PR"
```

---

### Task 5: Stop ignoring lint at build

**Files:**
- Modify: `next.config.mjs`

- [ ] **Step 1: Remove the lint bypass**

Delete this line from `next.config.mjs`:
```js
  eslint: { ignoreDuringBuilds: true },
```
Leave a comment in its place:
```js
  // Lint runs in CI and is no longer ignored at build time.
```

- [ ] **Step 2: Verify build still passes (lint now active)**

Run: `npm run build`
Expected: success with no lint errors. If lint errors surface, fix them, then re-run.

- [ ] **Step 3: Commit**

```bash
git add next.config.mjs
git commit -m "build: stop ignoring eslint during builds"
```

---

# Wave 2 — Single source of truth for tokens

### Task 6: Root Tailwind config reuses the design theme

**Files:**
- Modify: `tailwind.config.js`

- [ ] **Step 1: Replace `tailwind.config.js` body to spread the design theme**

```js
/**
 * Atlas Tailwind configuration (root).
 * The theme is owned by design/tailwind.config.js (the design-system source of
 * truth). This root config reuses that theme verbatim and only sets the app's
 * content globs, so the two can never drift.
 */
const design = require("./design/tailwind.config.js");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./emails/**/*.{ts,tsx}",
  ],
  theme: design.theme,
  plugins: design.plugins ?? [],
};
```

- [ ] **Step 2: Verify the build and a token-driven utility still render**

Run: `npm run build`
Expected: success. Then `npm run dev`, load `/`, confirm the indigo hero `<em>` and serif headings still render (theme intact).

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.js
git commit -m "refactor: root tailwind config reuses design-system theme"
```

---

### Task 7: globals.css imports the canonical tokens

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Replace the top of `app/globals.css`**

Replace the `@tailwind` lines AND the entire duplicated `:root { … }`,
`[data-theme="dark"] { … }` blocks with an import of the canonical tokens plus
the Tailwind layers. The base-typography `@layer base` block at the bottom stays.
New top of file:

```css
/* Canonical design tokens live in design/tokens.css (the source of truth).
   Imported here so the app never carries a second copy. */
@import "../design/tokens.css";

@tailwind base;
@tailwind components;
@tailwind utilities;
```

Then DELETE the in-file `:root { … }` and `[data-theme="dark"] { … }` blocks
(they now come from the import). Keep the existing `@layer base { html, body { … } ::selection { … } * { scrollbar-* } }` block at the bottom unchanged — it must remain AFTER `@tailwind base` so Preflight doesn't override the body font.

- [ ] **Step 2: Verify token values are unchanged**

Run: `npm run dev`, load `/sprint/spr-northwind-q2`. Confirm: brand indigo on score badges, zinc borders, Fraunces headings, body font all identical to before. Use devtools to confirm `getComputedStyle(document.documentElement).getPropertyValue('--brand')` is `#4f46e5`.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: success (the `@import` of a relative CSS path resolves through PostCSS).

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "refactor: import canonical design tokens, drop the duplicate"
```

---

# Wave 3 — Shared primitives & centralized maps

### Task 8: Centralized UI maps

**Files:**
- Create: `lib/ui-maps.ts`, `lib/ui-maps.test.ts`
- Modify (later steps): `app/(app)/sprint/[id]/page.tsx`, `app/(app)/twistag/page.tsx`, `components/session/ConversationView.tsx`, `app/(app)/me/sessions/[id]/edit/page.tsx`

- [ ] **Step 1: Create `lib/ui-maps.ts`**

```ts
/**
 * Centralized UI mappings from domain enums to presentational tokens.
 * One home so badge tones/labels can't drift across screens.
 */
import type {
  ParticipantStatus,
  ClientSummary,
  CaptureKind,
  OpportunityStatus,
} from "./types";

type BadgeTone =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "outline";

export const participantStatusMeta: Record<
  ParticipantStatus,
  { label: string; tone: BadgeTone }
> = {
  completed: { label: "Complete", tone: "success" },
  in_progress: { label: "In progress", tone: "brand" },
  idle: { label: "Idle", tone: "warning" },
  not_started: { label: "Not started", tone: "neutral" },
};

export const clientHealthMeta: Record<
  ClientSummary["health"],
  { label: string; tone: BadgeTone }
> = {
  healthy: { label: "Healthy", tone: "success" },
  watch: { label: "Watch", tone: "warning" },
  at_risk: { label: "At risk", tone: "danger" },
};

export const captureKindTone: Record<CaptureKind, BadgeTone> = {
  bottleneck: "danger",
  workaround: "brand",
  tooling: "neutral",
  handoff: "warning",
  frustration: "warning",
  sop: "neutral",
  decision: "brand",
};

export const opportunityStatusMeta: Record<
  OpportunityStatus,
  { label: string; tone: BadgeTone }
> = {
  provisional: { label: "Provisional", tone: "neutral" },
  surfaced: { label: "Surfaced", tone: "brand" },
  approved: { label: "Approved", tone: "success" },
  deferred: { label: "Deferred", tone: "warning" },
  declined: { label: "Declined", tone: "neutral" },
};
```

- [ ] **Step 2: Write `lib/ui-maps.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  participantStatusMeta,
  captureKindTone,
  clientHealthMeta,
} from "./ui-maps";

describe("ui-maps", () => {
  it("maps every participant status to a label + tone", () => {
    expect(participantStatusMeta.idle).toEqual({ label: "Idle", tone: "warning" });
    expect(participantStatusMeta.completed.tone).toBe("success");
  });

  it("maps capture kinds to tones", () => {
    expect(captureKindTone.bottleneck).toBe("danger");
    expect(captureKindTone.handoff).toBe("warning");
  });

  it("maps client health to a tone", () => {
    expect(clientHealthMeta.at_risk.tone).toBe("danger");
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npm test -- lib/ui-maps.test.ts`
Expected: PASS.

- [ ] **Step 4: Refactor consumers to import from `lib/ui-maps`**

In `app/(app)/sprint/[id]/page.tsx`: delete the local `statusMeta` object and its `ParticipantStatus` import usage; `import { participantStatusMeta } from "@/lib/ui-maps";` and replace `statusMeta[pt.status]` → `participantStatusMeta[pt.status]`.

In `app/(app)/twistag/page.tsx`: delete the local `healthMeta`; `import { clientHealthMeta } from "@/lib/ui-maps";` and replace `healthMeta[c.health]` → `clientHealthMeta[c.health]`.

In `components/session/ConversationView.tsx`: delete the local `kindTone` object; `import { captureKindTone } from "@/lib/ui-maps";` and replace `kindTone[c.kind] ?? "neutral"` → `captureKindTone[c.kind as CaptureKind] ?? "neutral"` (import `CaptureKind` type from `@/lib/types`).

In `app/(app)/me/sessions/[id]/edit/page.tsx` and `components/session/EditCaptures.tsx`: the kind→tone is currently always `neutral`; no change required unless a tone map was inlined — if so, switch to `captureKindTone`.

- [ ] **Step 5: Verify typecheck + build + visual parity**

Run: `npm run typecheck && npm run build`
Expected: success. `npm run dev`, confirm manager/twistag/session badges look identical.

- [ ] **Step 6: Commit**

```bash
git add lib/ui-maps.ts lib/ui-maps.test.ts "app/(app)/sprint/[id]/page.tsx" "app/(app)/twistag/page.tsx" components/session/ConversationView.tsx
git commit -m "refactor: centralize badge tone/label maps in lib/ui-maps"
```

---

### Task 9: StatCard primitive

**Files:**
- Create: `components/ui/StatCard.tsx`, `components/ui/StatCard.test.tsx`
- Modify: `app/(app)/sprint/[id]/page.tsx`, `app/(app)/twistag/page.tsx`, `components/opportunity/OpportunityDetail.tsx`

- [ ] **Step 1: Create `components/ui/StatCard.tsx`**

```tsx
import type { LucideIcon } from "lucide-react";
import { Card } from "./Card";

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-text-3">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="font-serif text-3xl font-medium tracking-tight">
        {value}
      </div>
      {sub ? <div className="mt-1 text-sm text-text-3">{sub}</div> : null}
    </Card>
  );
}
```

- [ ] **Step 2: Write `components/ui/StatCard.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Activity } from "lucide-react";
import { StatCard } from "./StatCard";

describe("StatCard", () => {
  it("renders label, value, and sub", () => {
    render(<StatCard icon={Activity} label="Participation" value="63%" sub="20/32 sessions" />);
    expect(screen.getByText("Participation")).toBeInTheDocument();
    expect(screen.getByText("63%")).toBeInTheDocument();
    expect(screen.getByText("20/32 sessions")).toBeInTheDocument();
  });

  it("omits sub when not provided", () => {
    const { container } = render(<StatCard icon={Activity} label="X" value="1" />);
    expect(container.textContent).not.toContain("undefined");
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npm test -- components/ui/StatCard.test.tsx`
Expected: PASS.

- [ ] **Step 4: Refactor the three consumers**

In `app/(app)/sprint/[id]/page.tsx`: the `stats` array stays, but replace the inline `<Card>…</Card>` in the stat-strip `.map` with `<StatCard key={s.label} icon={s.icon} label={s.label} value={s.value} sub={s.sub} />`. Import `StatCard`.

In `app/(app)/twistag/page.tsx`: same — replace the inline stat `<Card>` with `<StatCard icon={s.icon} label={s.label} value={s.value} />`.

In `components/opportunity/OpportunityDetail.tsx`: the four "key metrics" cards become `<StatCard icon={m.icon} label={m.label} value={m.value} />` (note: these use `text-lg` value styling currently — keep them as `StatCard` with the serif `text-3xl`, OR if the smaller value size matters visually, leave OpportunityDetail's metrics as-is and only refactor the two dashboards). Decision: refactor the two dashboards now; leave OpportunityDetail metrics if the size differs enough to matter — confirm visually and choose.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm test && npm run build`. `npm run dev`, confirm stat strips on `/sprint/...` and `/twistag` are visually unchanged.

- [ ] **Step 6: Commit**

```bash
git add components/ui/StatCard.tsx components/ui/StatCard.test.tsx "app/(app)/sprint/[id]/page.tsx" "app/(app)/twistag/page.tsx"
git commit -m "refactor: extract StatCard primitive, use in dashboards"
```

---

### Task 10: BackLink primitive

**Files:**
- Create: `components/ui/BackLink.tsx`
- Modify: `components/opportunity/OpportunityDetail.tsx`, `app/(app)/sprint/[id]/report/page.tsx`, `components/manager/NudgeComposer.tsx`, `components/session/EditCaptures.tsx`

- [ ] **Step 1: Create `components/ui/BackLink.tsx`**

```tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function BackLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-text-2 transition-colors hover:text-text"
    >
      <ArrowLeft className="h-4 w-4" /> {children}
    </Link>
  );
}
```

- [ ] **Step 2: Replace each inline back-link**

In all four files, replace the `<Link … ><ArrowLeft …/> Back to … </Link>` block with `<BackLink href="…">Back to …</BackLink>` (preserve each existing `href` and wrapper `className` like `mb-5`/`mb-6` by adding it to a surrounding element if needed). Import `BackLink` from `@/components/ui/BackLink`. Remove now-unused `ArrowLeft`/`Link` imports where they become unused (lint will flag).

- [ ] **Step 3: Verify**

Run: `npm run lint && npm run typecheck && npm run build`. Confirm the back links still render and navigate.

- [ ] **Step 4: Commit**

```bash
git add components/ui/BackLink.tsx "app/(app)/sprint/[id]/report/page.tsx" components/opportunity/OpportunityDetail.tsx components/manager/NudgeComposer.tsx components/session/EditCaptures.tsx
git commit -m "refactor: extract BackLink primitive"
```

---

### Task 11: Accessible Sheet (dialog) primitive

**Files:**
- Create: `components/ui/Sheet.tsx`, `components/ui/Sheet.test.tsx`

- [ ] **Step 1: Create `components/ui/Sheet.tsx`**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * Right-side slide-over dialog. Handles the modal a11y basics: role="dialog",
 * aria-modal, Escape to close, focus trap, and focus return to the trigger.
 */
export function Sheet({
  open,
  onClose,
  title,
  eyebrow,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    // Move focus into the panel.
    panelRef.current?.querySelector<HTMLElement>("button, a, input, textarea")?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <button
        className="absolute inset-0 bg-text/30 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close dialog"
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 flex h-full w-full max-w-xl flex-col bg-surface shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            {eyebrow ? (
              <div className="text-xs font-semibold uppercase tracking-[0.06em] text-brand">
                {eyebrow}
              </div>
            ) : null}
            <h2 className="font-serif text-xl font-medium tracking-tight">
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-text-3 hover:bg-surface-2 hover:text-text"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {children}
        </div>
        {footer ? (
          <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `components/ui/Sheet.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Sheet } from "./Sheet";

describe("Sheet", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <Sheet open={false} onClose={() => {}} title="T">body</Sheet>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("exposes a dialog role and title when open", () => {
    render(<Sheet open onClose={() => {}} title="Approve">body</Sheet>);
    expect(screen.getByRole("dialog", { name: "Approve" })).toBeInTheDocument();
  });

  it("calls onClose on Escape", async () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose} title="Approve">body</Sheet>);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npm test -- components/ui/Sheet.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 4: Commit**

```bash
git add components/ui/Sheet.tsx components/ui/Sheet.test.tsx
git commit -m "feat: accessible Sheet (dialog) primitive with focus trap + escape"
```

---

### Task 12: OpportunityCard primitive

**Files:**
- Create: `components/opportunity/OpportunityCard.tsx`
- Modify: `app/(app)/sprint/[id]/page.tsx`, `app/(app)/sprint/[id]/report/page.tsx`

- [ ] **Step 1: Create `components/opportunity/OpportunityCard.tsx`**

```tsx
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ScoreBadge } from "@/components/ScoreBadge";
import { usdRange } from "@/lib/data";
import type { Opportunity } from "@/lib/types";

export function OpportunityCard({
  opp,
  href,
  rank,
}: {
  opp: Opportunity;
  href: string;
  rank?: number;
}) {
  return (
    <Link href={href}>
      <Card className="group p-4 transition-all hover:border-border-strong hover:shadow">
        <div className="flex items-start gap-3">
          <ScoreBadge score={opp.compositeScore} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-md font-semibold leading-snug">
                {rank != null ? (
                  <span className="mr-1.5 text-xs font-semibold text-text-3">
                    {String(rank).padStart(2, "0")}
                  </span>
                ) : null}
                {opp.title}
              </h3>
              <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-text-3 transition-colors group-hover:text-brand" />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone="success">
                {usdRange(opp.impactLow, opp.impactHigh)}/yr
              </Badge>
              <Badge tone="outline">
                {opp.timeToShipWeeksLow}–{opp.timeToShipWeeksHigh} wks
              </Badge>
              <Badge tone="neutral">{opp.contributorCount} voices</Badge>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 2: Use it in the manager dashboard**

In `app/(app)/sprint/[id]/page.tsx`, replace the opportunities `.map(...)` block's inner `<Link>…<Card>…</Card></Link>` with:
```tsx
<OpportunityCard
  key={o.id}
  opp={o}
  href={`/sprint/${id}/opportunity/${o.id}`}
/>
```
Import `OpportunityCard`; remove the now-unused `ScoreBadge`, `ArrowUpRight`, `usdRange`, `Badge` imports if they become unused elsewhere on the page (lint will tell you).

- [ ] **Step 3: Use it in the report**

In `app/(app)/sprint/[id]/report/page.tsx`, replace the ranked-opportunities `.map((o, i) => …)` inner markup with:
```tsx
<OpportunityCard
  key={o.id}
  opp={o}
  href={`/sprint/${id}/opportunity/${o.id}`}
  rank={i + 1}
/>
```
(The report shows a rank number; the card supports it.) Remove now-unused imports flagged by lint.

- [ ] **Step 4: Verify**

Run: `npm run lint && npm run typecheck && npm run build`. `npm run dev`: confirm the opportunity cards on `/sprint/...` and `/sprint/.../report` look right (report keeps its rank number).

- [ ] **Step 5: Commit**

```bash
git add components/opportunity/OpportunityCard.tsx "app/(app)/sprint/[id]/page.tsx" "app/(app)/sprint/[id]/report/page.tsx"
git commit -m "refactor: extract OpportunityCard, share between dashboard and report"
```

---

### Task 13: OpportunityDetail uses ProgressBar + Sheet

**Files:**
- Modify: `components/opportunity/OpportunityDetail.tsx`

- [ ] **Step 1: Replace the hand-rolled dimension bars with `ProgressBar`**

Import `ProgressBar` from `@/components/ui/ProgressBar`. In the score-breakdown `.map`, replace the raw bar markup:
```tsx
<div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
  <div className="h-full rounded-full bg-brand" style={{ width: `${d.score * 10}%` }} />
</div>
```
with:
```tsx
<ProgressBar value={d.score * 10} />
```

- [ ] **Step 2: Move the approve sheet onto the `Sheet` primitive**

Import `Sheet`. Replace the entire `{sheetOpen && ( <div className="fixed inset-0 …"> … </div> )}` block with:
```tsx
<Sheet
  open={sheetOpen}
  onClose={() => setSheetOpen(false)}
  eyebrow="Auto-drafted SOW"
  title="Approve for FDE engagement"
  footer={
    <>
      <span className="text-xs text-text-3">
        Editable before send. Generated in ~30s from the evidence.
      </span>
      <Button
        variant="brand"
        onClick={() => {
          setApproved(true);
          setSheetOpen(false);
        }}
      >
        Send to Twistag
      </Button>
    </>
  }
>
  {/* keep the existing inner field markup: Field title, Field scope,
      the grid of Duration/Fixed price, ListField inclusions/exclusions,
      the Team block, ListField success metrics */}
</Sheet>
```
Keep the existing `Field`, `ListField`, and team markup as the `Sheet` children. Remove the now-unused `X` import if it is no longer referenced.

- [ ] **Step 3: Verify behaviour + a11y**

Run: `npm run typecheck && npm run build`. `npm run dev`, open an opportunity, click "Approve for FDE engagement": sheet opens, Escape closes it, focus returns to the trigger button, "Send to Twistag" shows the approved state. Dimension bars look identical.

- [ ] **Step 4: Commit**

```bash
git add components/opportunity/OpportunityDetail.tsx
git commit -m "refactor: OpportunityDetail uses ProgressBar + accessible Sheet"
```

---

# Wave 4 — Backend-readiness seam

### Task 14: Centralized session/user accessor

**Files:**
- Create: `lib/session.ts`
- Modify: `app/(app)/layout.tsx`, `components/AppHeader.tsx` (no change if it only takes props), `app/(app)/me/page.tsx`

- [ ] **Step 1: Create `lib/session.ts`**

```ts
/**
 * Session/user accessor — the single seam auth will plug into.
 * Today it returns the demo IC; in the backend phase this reads the Stytch JWT
 * (tenant_id, user_id, role) per docs/02-architecture.md §3.2. Async on purpose
 * so the swap is a no-op at call sites.
 */
import { currentIc } from "./data";
import type { Role, User } from "./types";

export async function getCurrentUser(): Promise<User> {
  return currentIc;
}

export async function getSession(): Promise<{
  user: User;
  tenantId: string;
  role: Role;
}> {
  const user = currentIc;
  return { user, tenantId: "spr-northwind-q2", role: user.role };
}
```

- [ ] **Step 2: Replace `db.me()` usages**

In `app/(app)/layout.tsx`: replace `const me = db.me();` with `const me = await getCurrentUser();` and make the component `async` (`export default async function AppLayout(...)`). Import `getCurrentUser` from `@/lib/session`; drop the `db` import if now unused.

In `app/(app)/me/page.tsx`: replace `const me = db.me();` with `const me = await getCurrentUser();` (the component is already `async`). Import `getCurrentUser`.

- [ ] **Step 3: Verify no stray `db.me()` remains**

Run: `grep -rn "db.me()" app components` → expect no results. Then `npm run typecheck && npm run build`.

- [ ] **Step 4: Commit**

```bash
git add lib/session.ts "app/(app)/layout.tsx" "app/(app)/me/page.tsx"
git commit -m "refactor: centralize current-user behind getCurrentUser/getSession seam"
```

---

### Task 15: Zod schemas for boundary validation

**Files:**
- Create: `lib/schemas.ts`, `lib/schemas.test.ts`
- Modify: `package.json` (add zod)

- [ ] **Step 1: Install Zod**

Run: `npm install zod@^4.4.3`

- [ ] **Step 2: Create `lib/schemas.ts`** (mirrors docs/02-architecture.md §6.3)

```ts
import { z } from "zod";

/** Capture extracted from a discovery reply. Validated before persistence. */
export const CaptureSchema = z.object({
  kind: z.enum([
    "bottleneck",
    "workaround",
    "tooling",
    "handoff",
    "frustration",
    "sop",
    "decision",
  ]),
  summary: z.string().min(15).max(280),
  source_quote: z.string(),
  tags: z.array(z.string()).max(5),
  confidence: z.number().min(0).max(1),
});
export type CaptureInput = z.infer<typeof CaptureSchema>;

/** Output of the extraction pass. */
export const ExtractionSchema = z.object({
  captures: z.array(CaptureSchema),
  notes_for_next_probe: z.string().nullable(),
});
export type ExtractionOutput = z.infer<typeof ExtractionSchema>;

/** Subset of opportunity fields an LLM proposes; full row adds scoring + ids. */
export const OpportunityCandidateSchema = z.object({
  title: z.string().min(8).max(120),
  description: z.string().min(20),
  category: z.string(),
  tags: z.array(z.string()).max(8),
});
export type OpportunityCandidate = z.infer<typeof OpportunityCandidateSchema>;
```

- [ ] **Step 3: Write `lib/schemas.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { CaptureSchema, ExtractionSchema } from "./schemas";

describe("CaptureSchema", () => {
  it("accepts a valid capture", () => {
    const ok = CaptureSchema.safeParse({
      kind: "bottleneck",
      summary: "Credit-hold queue is worked once daily, delaying release.",
      source_quote: "I have to physically get to them.",
      tags: ["credit-hold"],
      confidence: 0.8,
    });
    expect(ok.success).toBe(true);
  });

  it("rejects a too-short summary", () => {
    const bad = CaptureSchema.safeParse({
      kind: "bottleneck",
      summary: "short",
      source_quote: "x",
      tags: [],
      confidence: 0.5,
    });
    expect(bad.success).toBe(false);
  });

  it("rejects an unknown kind", () => {
    const bad = CaptureSchema.safeParse({
      kind: "nonsense",
      summary: "this summary is definitely long enough to pass",
      source_quote: "x",
      tags: [],
      confidence: 0.5,
    });
    expect(bad.success).toBe(false);
  });

  it("validates extraction envelope with nullable notes", () => {
    const ok = ExtractionSchema.safeParse({ captures: [], notes_for_next_probe: null });
    expect(ok.success).toBe(true);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npm test -- lib/schemas.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/schemas.ts lib/schemas.test.ts package.json package-lock.json
git commit -m "feat: zod schemas for capture/extraction boundary validation"
```

---

### Task 16: Make the data layer async

**Files:**
- Modify: `lib/data.ts`, and all `db.*` call sites

- [ ] **Step 1: Make every `db.*` accessor async in `lib/data.ts`**

Change the `db` object's methods to return Promises. Example:
```ts
export const db = {
  sprint: {
    get: async (_id?: string): Promise<Sprint> => sprint,
    progress: async (_id?: string): Promise<SprintProgress> => progress,
    activity: async (): Promise<ActivityItem[]> => activity,
  },
  session: {
    mine: async (): Promise<Session[]> => mySessions,
    get: async (id: string): Promise<Session | undefined> =>
      mySessions.find((s) => s.id === id),
  },
  opportunity: {
    listForSprint: async (_sprintId?: string): Promise<Opportunity[]> =>
      [...opportunities].sort((a, b) => b.compositeScore - a.compositeScore),
    get: async (id: string): Promise<Opportunity | undefined> =>
      opportunities.find((o) => o.id === id),
  },
  twistag: {
    clientList: async (): Promise<ClientSummary[]> => clients,
  },
};
```
Note: `db.me` is removed (replaced by `lib/session.ts` in Task 14). `currentIc`, `conversationScript`, `sowDraftFor`, `usdRange`, `usdShort` stay synchronous (they are constants/pure helpers, not data fetches).

- [ ] **Step 2: `await` every call site**

Update each server component that reads `db.*` to await. They are already `async`. Specifically:
- `app/(app)/sprint/[id]/page.tsx`: `const sprint = await db.sprint.get(id); const p = await db.sprint.progress(id); const opps = await db.opportunity.listForSprint(id); const activity = await db.sprint.activity();`
- `app/(app)/sprint/[id]/opportunity/[oppId]/page.tsx`: `const opp = await db.opportunity.get(oppId);`
- `app/(app)/sprint/[id]/report/page.tsx`: await `db.sprint.get`, `db.sprint.progress`, `db.opportunity.listForSprint`.
- `app/(app)/me/page.tsx`: `const sprint = await db.sprint.get(); const sessions = await db.session.mine();`
- `app/(app)/twistag/page.tsx`: make the component `async`; `const clients = await db.twistag.clientList();`
- `app/(app)/session/[id]/page.tsx`: `const session = await db.session.get(id); const sprint = await db.sprint.get();`
- `app/(app)/sprint/[id]/nudge/[participantId]/page.tsx`: `const sprint = await db.sprint.get(id);`
- `app/(app)/me/sessions/[id]/edit/page.tsx`: `const session = await db.session.get(id);`

- [ ] **Step 3: Verify no un-awaited Promise leaks into JSX**

Run: `npm run typecheck`
Expected: success. (TS will error if a `Promise<Sprint>` is used where `Sprint` is expected — fix any it flags.) Then `npm run build`.

- [ ] **Step 4: Verify all routes still render**

`npm run dev`; load `/me`, `/sprint/spr-northwind-q2`, an opportunity, the report, `/twistag`, a session, a nudge URL, an edit URL. All 200, content intact.

- [ ] **Step 5: Commit**

```bash
git add lib/data.ts "app/(app)"
git commit -m "refactor: make the data layer async so backend swap is mechanical"
```

---

### Task 17: Loading & error boundaries

**Files:**
- Create: `app/(app)/loading.tsx`, `app/(app)/error.tsx`, `app/(app)/sprint/[id]/loading.tsx`, `app/(app)/sprint/[id]/opportunity/[oppId]/loading.tsx`
- Create (skeleton helper): `components/ui/Skeleton.tsx`

- [ ] **Step 1: Create `components/ui/Skeleton.tsx`**

```tsx
import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded bg-surface-2 motion-reduce:animate-none",
        className,
      )}
    />
  );
}
```

- [ ] **Step 2: Create `app/(app)/loading.tsx`** (shell-level fallback)

```tsx
import { Skeleton } from "@/components/ui/Skeleton";

export default function AppLoading() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <Skeleton className="mb-2 h-8 w-72" />
      <Skeleton className="mb-6 h-4 w-96" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Create `app/(app)/error.tsx`** (must be a client component)

```tsx
"use client";

import { Button } from "@/components/ui/Button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <h1 className="font-serif text-2xl font-medium tracking-tight">
        Something didn&apos;t load.
      </h1>
      <p className="mt-2 text-md text-text-2">
        This view hit an error. You can retry — if it keeps happening, the data
        source may be temporarily unavailable.
      </p>
      <Button variant="brand" className="mt-5" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
```

- [ ] **Step 4: Create route-level skeletons that match layout**

`app/(app)/sprint/[id]/loading.tsx`:
```tsx
import { Skeleton } from "@/components/ui/Skeleton";

export default function SprintLoading() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <Skeleton className="mb-2 h-8 w-80" />
      <Skeleton className="mb-6 h-4 w-[28rem]" />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    </main>
  );
}
```

`app/(app)/sprint/[id]/opportunity/[oppId]/loading.tsx`:
```tsx
import { Skeleton } from "@/components/ui/Skeleton";

export default function OpportunityLoading() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <Skeleton className="mb-5 h-4 w-28" />
      <Skeleton className="mb-3 h-10 w-2/3" />
      <Skeleton className="mb-6 h-16 w-full" />
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Verify the boundaries engage**

Temporarily add `await new Promise((r) => setTimeout(r, 1500));` at the top of `db.sprint.get` in `lib/data.ts`, run `npm run dev`, load `/sprint/spr-northwind-q2`, confirm the skeleton shows then content replaces it. **Remove the artificial delay afterward.** To test `error.tsx`, temporarily `throw new Error("boom")` in a page, confirm the boundary renders, then revert.

- [ ] **Step 6: Verify build + commit**

Run: `npm run typecheck && npm run lint && npm run build`
```bash
git add components/ui/Skeleton.tsx "app/(app)/loading.tsx" "app/(app)/error.tsx" "app/(app)/sprint/[id]/loading.tsx" "app/(app)/sprint/[id]/opportunity/[oppId]/loading.tsx"
git commit -m "feat: loading skeletons and error boundary for the app routes"
```

---

# Wave 5 — Fonts, metadata, accessibility

### Task 18: Self-hosted fonts via next/font

**Files:**
- Create: `app/fonts.ts`
- Modify: `app/layout.tsx`, `app/globals.css` (or `design/tokens.css`) font vars

- [ ] **Step 1: Create `app/fonts.ts`**

```ts
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";

export const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
  variable: "--font-fraunces",
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains",
});
```

- [ ] **Step 2: Apply the font variables in `app/layout.tsx`**

Remove the three Google `<link>` tags and the `<head>` preconnects. Add the font variable classes to `<html>`:
```tsx
import { inter, fraunces, jetbrainsMono } from "./fonts";
// ...
return (
  <html
    lang="en"
    className={`${inter.variable} ${fraunces.variable} ${jetbrainsMono.variable}`}
  >
    <body>{children}</body>
  </html>
);
```

- [ ] **Step 3: Point the token font vars at the next/font variables**

In `design/tokens.css`, update the `--font-*` declarations to consume the next/font variables with the same fallbacks:
```css
  --font-sans: var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-serif: var(--font-fraunces), Georgia, serif;
  --font-mono: var(--font-jetbrains), ui-monospace, monospace;
```

- [ ] **Step 4: Verify fonts + no external link**

Run: `npm run build` (next/font fetches at build — needs network once). `npm run dev`: confirm Inter body, Fraunces headings (including the italic hero `<em>`), JetBrains Mono in the "how it works" visual. View source: no `fonts.googleapis.com` link.

- [ ] **Step 5: Commit**

```bash
git add app/fonts.ts app/layout.tsx design/tokens.css
git commit -m "perf: self-host fonts via next/font, drop render-blocking link"
```

---

### Task 19: Per-route metadata + robots/sitemap

**Files:**
- Modify: `app/(app)/me/page.tsx`, `app/(app)/twistag/page.tsx`, `app/(app)/session/[id]/page.tsx`, `app/(app)/sprint/[id]/page.tsx`, `app/(app)/sprint/[id]/opportunity/[oppId]/page.tsx`, `app/(app)/sprint/[id]/report/page.tsx`
- Create: `app/robots.ts`, `app/sitemap.ts`

- [ ] **Step 1: Add static metadata to the static-titled routes**

In `app/(app)/me/page.tsx` and `app/(app)/twistag/page.tsx`, add above the component:
```tsx
import type { Metadata } from "next";
export const metadata: Metadata = { title: "My sprint · Atlas" }; // and "Clients · Atlas" for twistag
```

- [ ] **Step 2: Add `generateMetadata` to the dynamic data routes**

In `app/(app)/sprint/[id]/page.tsx`:
```tsx
import type { Metadata } from "next";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const sprint = await db.sprint.get(id);
  return { title: `${sprint.name} · Atlas` };
}
```
In `app/(app)/sprint/[id]/opportunity/[oppId]/page.tsx`:
```tsx
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; oppId: string }>;
}): Promise<Metadata> {
  const { oppId } = await params;
  const opp = await db.opportunity.get(oppId);
  return { title: opp ? `${opp.title} · Atlas` : "Opportunity · Atlas" };
}
```
In `app/(app)/sprint/[id]/report/page.tsx`: title `"Discovery report · Atlas"`. In `app/(app)/session/[id]/page.tsx`: title `"Discovery session · Atlas"` (static is fine).

- [ ] **Step 3: Create `app/robots.ts`**

```ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/me", "/sprint", "/twistag", "/session"] }],
    sitemap: "https://atlas.twistag.com/sitemap.xml",
  };
}
```

- [ ] **Step 4: Create `app/sitemap.ts`** (marketing surface only)

```ts
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://atlas.twistag.com";
  return [
    { url: `${base}/`, priority: 1 },
    { url: `${base}/pricing`, priority: 0.8 },
  ];
}
```

- [ ] **Step 5: Verify**

Run: `npm run build`. `npm run dev`: check `<title>` on each route (devtools), and that `/robots.txt` and `/sitemap.xml` resolve.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)" app/robots.ts app/sitemap.ts
git commit -m "feat: per-route metadata titles + robots/sitemap for marketing"
```

---

### Task 20: Accessibility fixes

**Files:**
- Modify: `design/tokens.css` (muted-text value), `components/session/ConversationView.tsx` (label + live region), `app/(marketing)/page.tsx` (footer links), `app/globals.css` (reduced-motion safety)

- [ ] **Step 1: Fix muted-text contrast (decision §6.2)**

In `design/tokens.css`, change the light-theme muted text token to an AA-passing value and add a separate faint token for decorative use:
```css
  --text-3: #71717a;        /* AA on white (~4.6:1) — for muted text */
  --text-faint: #a1a1aa;    /* decorative only: hairlines, inactive icons */
```
Leave the dark-theme `--text-3` as is. (No mass find/replace needed — `text-text-3` now resolves to the accessible value everywhere. Where a divider/icon truly wants the lighter tone, it can opt into `--text-faint` later; not required for this task.)

- [ ] **Step 2: Label the conversation textarea + announce captures**

In `components/session/ConversationView.tsx`:
- Add `aria-label="Your message"` to the `<textarea>`.
- On the capture side-panel list container, add `aria-live="polite"` and `aria-label="Captures heard so far"` so new captures are announced.

- [ ] **Step 3: Make footer "links" real anchors**

In `app/(marketing)/page.tsx`, the footer `<span className="… cursor-pointer …">{l}</span>` items become `<a href="#" className="…">{l}</a>` (placeholder hrefs are fine for the marketing stub; they're now keyboard-focusable and semantic).

- [ ] **Step 4: Respect reduced motion globally**

In `app/globals.css`, add to the `@layer base` block:
```css
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
    }
  }
```

- [ ] **Step 5: Verify**

Run: `npm run build`. `npm run dev`: confirm secondary text is slightly darker but legible; tab to the footer links; with OS "reduce motion" on, the typing-dots don't animate. Optionally run Lighthouse a11y on `/`, `/me`, `/sprint/...` — target ≥ 95.

- [ ] **Step 6: Commit**

```bash
git add design/tokens.css components/session/ConversationView.tsx "app/(marketing)/page.tsx" app/globals.css
git commit -m "a11y: AA muted-text contrast, textarea label + live region, reduced-motion, real footer links"
```

---

# Wave 6 — Test fill-in & green CI

### Task 21: Unit tests for the remaining primitives

**Files:**
- Create: `components/ui/Button.test.tsx`, `components/ui/ProgressBar.test.tsx`, `components/ScoreBadge.test.tsx`

- [ ] **Step 1: `components/ui/Button.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("renders children and handles clicks", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Send</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not fire when disabled", async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Send</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: `components/ui/ProgressBar.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ProgressBar } from "./ProgressBar";

describe("ProgressBar", () => {
  it("exposes its value via the progressbar role", () => {
    render(<ProgressBar value={63} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "63");
  });

  it("clamps out-of-range values", () => {
    render(<ProgressBar value={140} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });
});
```

- [ ] **Step 3: `components/ScoreBadge.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ScoreBadge } from "./ScoreBadge";

describe("ScoreBadge", () => {
  it("renders the score to one decimal", () => {
    render(<ScoreBadge score={8.7} />);
    expect(screen.getByText("8.7")).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run all new tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add components/ui/Button.test.tsx components/ui/ProgressBar.test.tsx components/ScoreBadge.test.tsx
git commit -m "test: unit tests for Button, ProgressBar, ScoreBadge"
```

---

### Task 22: ConversationView behavioural test

**Files:**
- Create: `components/session/ConversationView.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { ConversationView } from "./ConversationView";

describe("ConversationView", () => {
  it("shows the opening question and an empty capture panel", () => {
    render(<ConversationView sessionId="ses-4" topicTitle="One change" />);
    expect(screen.getByText(/walk me through what happens/i)).toBeInTheDocument();
    expect(screen.getByText(/0/)).toBeInTheDocument();
  });

  it("surfaces a capture after the user replies", async () => {
    render(<ConversationView sessionId="ses-4" topicTitle="One change" />);
    const box = screen.getByLabelText("Your message");
    await userEvent.type(box, "It lands in a queue and some get stuck.");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    // The scripted assistant follow-up appears.
    expect(await screen.findByText(/what makes one stick/i)).toBeInTheDocument();
    // A capture is surfaced in the side panel.
    expect(
      await screen.findByText(/New orders enter a shared queue/i),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm test -- components/session/ConversationView.test.tsx`
Expected: PASS. (The component uses `setTimeout(900)`; `findBy*` waits up to 1000ms by default — if flaky, the timer still resolves within the default timeout. If needed, wrap with `{ timeout: 2000 }`.)

- [ ] **Step 3: Commit**

```bash
git add components/session/ConversationView.test.tsx
git commit -m "test: ConversationView surfaces captures on reply"
```

---

### Task 23: OpportunityDetail approve-flow test

**Files:**
- Create: `components/opportunity/OpportunityDetail.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { OpportunityDetail } from "./OpportunityDetail";
import { db, sowDraftFor } from "@/lib/data";

async function getFixtures() {
  const opp = (await db.opportunity.get("opp-1"))!;
  return { opp, sow: sowDraftFor(opp) };
}

describe("OpportunityDetail approve flow", () => {
  it("opens the SOW sheet and confirms approval", async () => {
    const { opp, sow } = await getFixtures();
    render(<OpportunityDetail sprintId="spr-northwind-q2" opp={opp} sow={sow} />);

    await userEvent.click(
      screen.getByRole("button", { name: /approve for fde engagement/i }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(sow.title)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /send to twistag/i }));
    expect(screen.getByText(/approved for fde/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm test -- components/opportunity/OpportunityDetail.test.tsx`
Expected: PASS. (Note: `db.opportunity.get` is async after Task 16 — the test awaits it.)

- [ ] **Step 3: Commit**

```bash
git add components/opportunity/OpportunityDetail.test.tsx
git commit -m "test: OpportunityDetail approve-for-FDE flow"
```

---

### Task 24: Full green gate + branch wrap-up

**Files:** none (verification + docs)

- [ ] **Step 1: Run the complete gate locally**

Run: `npm run format:check && npm run typecheck && npm run lint && npm test && npm run build`
Expected: all pass. (If `format:check` fails, run `npm run format` and commit the formatting.)

- [ ] **Step 2: Confirm the audit's grep-clean success criteria**

Run and expect no stray results:
```bash
grep -rn "db.me()" app components            # → none
grep -rn "ignoreDuringBuilds" next.config.mjs # → none
grep -rln "fonts.googleapis.com" app          # → none
```
Confirm no duplicated tone maps remain (the only `Record<` tone maps live in `lib/ui-maps.ts`).

- [ ] **Step 3: Update the design spec status + README test note**

In `docs/superpowers/specs/2026-06-09-frontend-hardening-design.md`, change `Status:` to `Implemented`. In `README.md` "Running the app", add: `npm test` runs the Vitest suite; CI runs typecheck + lint + test + build.

- [ ] **Step 4: Commit and push the branch**

```bash
git add docs/superpowers/specs/2026-06-09-frontend-hardening-design.md README.md
git commit -m "docs: mark front-end hardening spec implemented; note test command"
git push -u origin frontend-hardening
```

- [ ] **Step 5: Open the PR** (manual or via the platform)

Title: `Front-end hardening before backend`. Body: link the spec + plan, summarize the six waves, confirm CI green. Merge to `main` after review.

---

## Self-review notes (author)

- **Spec coverage:** Wave 1↔§5.1, Wave 2↔§5.2/§6.1, Wave 3↔§5.3, Wave 4↔§5.4/§6.3, Wave 5↔§5.5/§6.2, Wave 6↔§5.6. Every spec section maps to ≥1 task.
- **Contrast decision (§6.2)** implemented in Task 20 Step 1 with the `--text-faint` escape hatch.
- **Async seam (§6.3)** is Task 16; `getSession` seam is Task 14; both precede loading/error (Task 17) so boundaries are designed against real async.
- **Type consistency:** map names (`participantStatusMeta`, `clientHealthMeta`, `captureKindTone`, `opportunityStatusMeta`), `getCurrentUser`/`getSession`, `Sheet` props (`open`/`onClose`/`title`/`eyebrow`/`footer`), and `OpportunityCard` props (`opp`/`href`/`rank`) are used identically across the tasks that reference them.
- **Known nuance:** Task 9 leaves OpportunityDetail's four metric cards as a judgment call (StatCard's serif value size differs from the current `text-lg`); the executor decides by visual parity. This is intentional, not a placeholder.
