# Manager Experience v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the manager role a polished command center — land on the dashboard, every contributor clickable to a participant detail, a working report export, and a responsive team list.

**Architecture:** A small `landingPathFor` helper drives role-aware post-sign-in routing. `sprint.participant` is extended to return the participant's per-session breakdown, powering a new participant detail page that the dashboard's team rows link to. The team list becomes a responsive component (table on desktop, cards on mobile). The report's dead "Download PDF" becomes a real `window.print()` with print CSS.

**Tech Stack:** Next.js 15 RSC + client components, tRPC v11 + Zod, Drizzle/RLS, Tailwind, Vitest.

---

## Working agreements
- Worktree off local HEAD; `npm install`; copy `.env.local`. Gate after each task:
  `npm run typecheck && npm run lint && npm run test`; `npm run test:integration` for the router task; `npm run build` before merge.
- Commit per task with pathspec-scoped `git add`.
- Preserve existing tests (ConversationView, OpportunityDetail, router) — they must stay green.

## File structure
- Create `lib/landing.ts` + `lib/landing.test.ts` — role → landing path.
- Create `app/(app)/sprint/[id]/participant/[participantId]/page.tsx` — participant detail.
- Create `components/manager/TeamProgress.tsx` — responsive team list (client).
- Create `components/report/PrintButton.tsx` — client print button.
- Modify `app/sign-in/dev/page.tsx` — use `landingPathFor`.
- Modify `app/auth/callback/route.ts` — role-aware default landing.
- Modify `server/trpc/routers/sprint.ts` — `participant` returns `sessions[]`.
- Modify `server/trpc/router.integration.test.ts` — participant sessions assertions.
- Modify `app/(app)/sprint/[id]/page.tsx` — render `<TeamProgress>`.
- Modify `app/(app)/sprint/[id]/nudge/[participantId]/page.tsx` — redirect to participant page.
- Modify `app/(app)/sprint/[id]/report/page.tsx` — use `<PrintButton>`.
- Modify `app/globals.css` — `@media print` rules + a `data-chrome` hook on app chrome.

---

## Task 1: Role-aware landing

**Files:** Create `lib/landing.ts`, `lib/landing.test.ts`; Modify `app/sign-in/dev/page.tsx`, `app/auth/callback/route.ts`.

- [ ] **Step 1: Write the failing test** — `lib/landing.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { landingPathFor } from "./landing";

describe("landingPathFor", () => {
  it("routes by role", () => {
    expect(landingPathFor("twistag_admin")).toBe("/admin");
    expect(landingPathFor("twistag_lead")).toBe("/admin");
    expect(landingPathFor("manager")).toBe("/sprint");
    expect(landingPathFor("sponsor")).toBe("/sprint");
    expect(landingPathFor("ic")).toBe("/me");
    expect(landingPathFor("")).toBe("/me");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- lib/landing.test.ts`
Expected: FAIL — cannot resolve `./landing`.

- [ ] **Step 3: Implement** — `lib/landing.ts`

```ts
/**
 * Post-sign-in landing path by role. Managers/sponsors go to their command
 * center (the sprint dashboard); Twistag staff to the admin/cockpit; ICs to /me.
 */
export function landingPathFor(role: string): string {
  if (role.startsWith("twistag")) return "/admin";
  if (role === "manager" || role === "sponsor") return "/sprint";
  return "/me";
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test -- lib/landing.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire dev sign-in** — edit `app/sign-in/dev/page.tsx`

Replace the local `nextFor` function and its uses. Remove:

```ts
function nextFor(role: string): string {
  if (role.startsWith("twistag")) return "/admin";
  if (role === "manager" || role === "sponsor") return "/team";
  return "/me";
}
```

Add the import near the other imports:

```ts
import { landingPathFor } from "@/lib/landing";
```

Change the two `next={nextFor(s.role)}` / `next={nextFor(m.role)}` usages to
`next={landingPathFor(s.role)}` and `next={landingPathFor(m.role)}`.

- [ ] **Step 6: Wire the magic-link callback** — replace `app/auth/callback/route.ts`

```ts
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decodeJwtPayload, parseClaims } from "@/lib/auth-claims";
import { landingPathFor } from "@/lib/landing";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const explicitNext = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      let dest = explicitNext;
      if (!dest) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const claims = parseClaims(
          decodeJwtPayload(session?.access_token ?? ""),
        );
        const role =
          claims?.kind === "twistag"
            ? claims.twistagRole
            : claims?.kind === "tenant"
              ? claims.role
              : "";
        dest = landingPathFor(role);
      }
      return NextResponse.redirect(`${origin}${dest}`);
    }
  }
  return NextResponse.redirect(`${origin}/sign-in?error=auth`);
}
```

- [ ] **Step 7: Gate**

Run: `npm run typecheck && npm run lint && npm run test -- lib/landing.test.ts`
Expected: clean / green.

- [ ] **Step 8: Commit**

```bash
git add lib/landing.ts lib/landing.test.ts app/sign-in/dev/page.tsx app/auth/callback/route.ts
git commit -m "feat(nav): role-aware landing — managers land on the dashboard"
```

---

## Task 2: `sprint.participant` returns the session breakdown

**Files:** Modify `server/trpc/routers/sprint.ts`, `server/trpc/router.integration.test.ts`.

- [ ] **Step 1: Extend the integration test** — in `server/trpc/router.integration.test.ts`, find the existing `describe("sprint.participant", ...)` block and add a session-seeding + assertion. Inside its `beforeEach`, after the `sprintParticipants` insert, add a topic + session for PUSER:

```ts
    await seedRow((tx) =>
      tx.insert(topics).values({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa00t1",
        tenantId: TENANT_A,
        sprintId: SPRINT_A,
        title: "How work flows",
        description: "d",
        orderIdx: 1,
        questionCount: 5,
        estMinutes: 6,
      }),
    );
    await seedRow((tx) =>
      tx.insert(sessions).values({
        tenantId: TENANT_A,
        sprintId: SPRINT_A,
        topicId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa00t1",
        userId: PUSER,
        status: "completed",
      }),
    );
```

Add an assertion to the existing "returns a participant's nudge view" test (or a new `it`):

```ts
  it("includes the participant's per-session breakdown", async () => {
    const p = await asManager(TENANT_A, PMGR).sprint.participant({
      sprintId: SPRINT_A,
      userId: PUSER,
    });
    expect(p.sessions).toEqual([
      { topicTitle: "How work flows", status: "completed" },
    ]);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:integration -- server/trpc/router.integration.test.ts`
Expected: FAIL — `p.sessions` is undefined.

- [ ] **Step 3: Implement** — edit `server/trpc/routers/sprint.ts`, the `participant` procedure. After fetching the participant `row`, add a sessions query and include it in the return. Replace the procedure body's return with:

```ts
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });

        const sessionRows = await tx
          .select({
            topicTitle: topics.title,
            status: sessions.status,
            orderIdx: topics.orderIdx,
          })
          .from(sessions)
          .leftJoin(topics, eq(sessions.topicId, topics.id))
          .where(
            and(
              eq(sessions.sprintId, input.sprintId),
              eq(sessions.userId, input.userId),
            ),
          )
          .orderBy(topics.orderIdx);

        return {
          name: row.name,
          title: row.title ?? "Contributor",
          status: row.status,
          sessionsCompleted: row.sessionsCompleted,
          sessionsTotal: row.sessionsTotal,
          lastActiveLabel: row.lastActiveLabel ?? "",
          sessions: sessionRows.map((s) => ({
            topicTitle: s.topicTitle ?? "Session",
            status: s.status,
          })),
        };
```

> This requires `sessions` + `topics` imported in `sprint.ts` (both already are) and `lastActiveLabel` selected. Update the `participant` select to also fetch `lastActiveLabel: sprintParticipants.lastActiveLabel`. Add it to the existing `.select({...})` object in that procedure.

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:integration -- server/trpc/router.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

```bash
npm run typecheck && npm run lint
git add server/trpc/routers/sprint.ts server/trpc/router.integration.test.ts
git commit -m "feat(trpc): sprint.participant returns per-session breakdown + last active"
```

---

## Task 3: Participant detail page + nudge redirect

**Files:** Create `app/(app)/sprint/[id]/participant/[participantId]/page.tsx`; Modify `app/(app)/sprint/[id]/nudge/[participantId]/page.tsx`.

- [ ] **Step 1: Create the participant page**

```tsx
import { notFound } from "next/navigation";
import { Check, Clock } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { BackLink } from "@/components/ui/BackLink";
import { NudgeComposer } from "@/components/manager/NudgeComposer";
import { getApi } from "@/server/trpc/caller";
import { requireManagerOrSponsor } from "@/lib/auth-guards";
import { participantStatusMeta } from "@/lib/ui-maps";
import type { ParticipantStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ParticipantPage({
  params,
}: {
  params: Promise<{ id: string; participantId: string }>;
}) {
  const { id, participantId } = await params;
  await requireManagerOrSponsor();
  const api = await getApi();
  const p = await api.sprint
    .participant({ sprintId: id, userId: participantId })
    .catch(() => null);
  if (!p) notFound();

  const meta = participantStatusMeta[p.status as ParticipantStatus];

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <BackLink href={`/sprint/${id}`}>Back to sprint</BackLink>

      <div className="mb-6 mt-4 flex items-center gap-3">
        <Avatar name={p.name} size="lg" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
          <div className="mt-0.5 flex items-center gap-2 text-sm text-text-2">
            <span>{p.title}</span>
            {meta ? <Badge tone={meta.tone}>{meta.label}</Badge> : null}
            <span className="text-text-3">·</span>
            <span className="text-text-3">
              {p.sessionsCompleted}/{p.sessionsTotal} sessions
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-text-2">Sessions</h2>
          <Card className="divide-y divide-border">
            {p.sessions.length === 0 ? (
              <div className="px-4 py-4 text-sm text-text-3">
                No sessions yet.
              </div>
            ) : (
              p.sessions.map((s, i) => {
                const done = s.status === "completed";
                return (
                  <div
                    key={`${s.topicTitle}-${i}`}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <span
                      className={
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full " +
                        (done
                          ? "bg-success text-white"
                          : "bg-surface-2 text-text-3")
                      }
                    >
                      {done ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Clock className="h-3 w-3" />
                      )}
                    </span>
                    <span className="flex-1 text-sm font-medium">
                      {s.topicTitle}
                    </span>
                    <span className="text-xs text-text-3">
                      {done ? "Completed" : "Pending"}
                    </span>
                  </div>
                );
              })
            )}
          </Card>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold text-text-2">Nudge</h2>
          <NudgeComposer
            sprintId={id}
            name={p.name}
            role={p.title}
            status={p.status}
            sessionsCompleted={p.sessionsCompleted}
            sessionsTotal={p.sessionsTotal}
          />
        </div>
      </div>
    </main>
  );
}
```

> Verify `Avatar` supports `size="lg"`; if not, use `size="md"`. Verify `BackLink` import path (`@/components/ui/BackLink` — used in the report page). `NudgeComposer` props match Task — it takes `sprintId, name, role, status, sessionsCompleted, sessionsTotal` (confirmed in the component).

- [ ] **Step 2: Redirect the old nudge route** — replace `app/(app)/sprint/[id]/nudge/[participantId]/page.tsx`

```tsx
import { redirect } from "next/navigation";

export default async function NudgeRedirect({
  params,
}: {
  params: Promise<{ id: string; participantId: string }>;
}) {
  const { id, participantId } = await params;
  redirect(`/sprint/${id}/participant/${participantId}`);
}
```

- [ ] **Step 3: Gate + commit**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: clean (13 → 14 routes).

```bash
git add "app/(app)/sprint/[id]/participant/[participantId]/page.tsx" "app/(app)/sprint/[id]/nudge/[participantId]/page.tsx"
git commit -m "feat(manager): participant detail page (progress + nudge); nudge route redirects"
```

---

## Task 4: Responsive TeamProgress + clickable rows

**Files:** Create `components/manager/TeamProgress.tsx`; Modify `app/(app)/sprint/[id]/page.tsx`.

- [ ] **Step 1: Create the component** — `components/manager/TeamProgress.tsx`

```tsx
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Table, THead, Th, HeaderRow, Tr, Td } from "@/components/ui/Table";
import { participantStatusMeta } from "@/lib/ui-maps";
import type { Participant } from "@/lib/types";

/** Team progress: a table on desktop, stacked cards on mobile. Each contributor
 *  links to their participant detail page. */
export function TeamProgress({
  sprintId,
  participants,
}: {
  sprintId: string;
  participants: Participant[];
}) {
  const href = (uid: string) => `/sprint/${sprintId}/participant/${uid}`;

  return (
    <>
      {/* Desktop table */}
      <Card className="hidden overflow-hidden lg:block">
        <Table>
          <THead>
            <HeaderRow>
              <Th>Contributor</Th>
              <Th>Progress</Th>
              <Th>Status</Th>
              <Th align="right">Last active</Th>
            </HeaderRow>
          </THead>
          <tbody>
            {participants.map((pt) => {
              const meta = participantStatusMeta[pt.status];
              const pct = Math.round(
                (pt.sessionsCompleted / pt.sessionsTotal) * 100,
              );
              const needsNudge =
                pt.status === "idle" || pt.status === "not_started";
              return (
                <Tr key={pt.user.id} hover={false}>
                  <Td>
                    <Link
                      href={href(pt.user.id)}
                      className="flex items-center gap-2.5 hover:text-brand"
                    >
                      <Avatar name={pt.user.name} size="sm" />
                      <div className="min-w-0">
                        <div className="font-medium leading-tight">
                          {pt.user.name}
                        </div>
                        <div className="text-xs text-text-3">
                          {pt.user.department}
                        </div>
                      </div>
                    </Link>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <ProgressBar
                        value={pct}
                        tone={pt.status === "idle" ? "warning" : "brand"}
                        className="w-20"
                      />
                      <span className="font-mono text-xs tabular-nums text-text-3">
                        {pt.sessionsCompleted}/{pt.sessionsTotal}
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </Td>
                  <Td align="right" className="text-xs text-text-3">
                    {needsNudge ? (
                      <Link
                        href={href(pt.user.id)}
                        className="font-medium text-brand hover:text-brand-hover"
                      >
                        Send nudge →
                      </Link>
                    ) : (
                      pt.lastActiveLabel
                    )}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      {/* Mobile cards */}
      <div className="space-y-2 lg:hidden">
        {participants.map((pt) => {
          const meta = participantStatusMeta[pt.status];
          const pct = Math.round(
            (pt.sessionsCompleted / pt.sessionsTotal) * 100,
          );
          return (
            <Link key={pt.user.id} href={href(pt.user.id)} className="block">
              <Card className="p-4 transition-colors hover:bg-surface-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={pt.user.name} size="sm" />
                    <div className="min-w-0">
                      <div className="font-medium leading-tight">
                        {pt.user.name}
                      </div>
                      <div className="text-xs text-text-3">
                        {pt.user.department}
                      </div>
                    </div>
                  </div>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <ProgressBar
                    value={pct}
                    tone={pt.status === "idle" ? "warning" : "brand"}
                    className="flex-1"
                  />
                  <span className="font-mono text-xs tabular-nums text-text-3">
                    {pt.sessionsCompleted}/{pt.sessionsTotal}
                  </span>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Use it in the dashboard** — edit `app/(app)/sprint/[id]/page.tsx`

Add the import:

```tsx
import { TeamProgress } from "@/components/manager/TeamProgress";
```

Replace the entire team-progress `<Card className="overflow-hidden"><Table>…</Table></Card>` block (the one under the `{/* Left: team progress */}` heading) with:

```tsx
          <TeamProgress sprintId={id} participants={sprint.participants} />
```

Then remove now-unused imports from the dashboard page if they're no longer referenced there: `Table, THead, Th, HeaderRow, Tr, Td`, `Avatar`, `ProgressBar`, `participantStatusMeta`, and `Link` (only if no other usage remains — the opportunities/activity sections may still use some). Run lint to catch unused imports and remove exactly those flagged.

- [ ] **Step 3: Gate + commit**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: clean.

```bash
git add components/manager/TeamProgress.tsx "app/(app)/sprint/[id]/page.tsx"
git commit -m "feat(manager): responsive team progress (table+cards), rows link to participant"
```

---

## Task 5: Report "Download PDF" → print

**Files:** Create `components/report/PrintButton.tsx`; Modify `app/(app)/sprint/[id]/report/page.tsx`, `app/globals.css`.

- [ ] **Step 1: Create the client button** — `components/report/PrintButton.tsx`

```tsx
"use client";

import { Download } from "lucide-react";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded border border-border bg-surface px-3 py-1.5 text-[13px] font-medium hover:bg-surface-2"
    >
      <Download className="h-3.5 w-3.5" /> Download PDF
    </button>
  );
}
```

- [ ] **Step 2: Use it in the report** — edit `app/(app)/sprint/[id]/report/page.tsx`

Add import:

```tsx
import { PrintButton } from "@/components/report/PrintButton";
```

Replace the dead button:

```tsx
          <button className="inline-flex items-center gap-1.5 rounded border border-border bg-surface px-3 py-1.5 text-[13px] font-medium hover:bg-surface-2">
            <Download className="h-3.5 w-3.5" /> Download PDF
          </button>
```

with:

```tsx
          <PrintButton />
```

Then remove the now-unused `Download` import from the report page if `Download` is unused elsewhere there (the cover/sections use `Check`; verify and drop `Download` from the lucide import). Add a `data-print-hide` attribute to the report's sticky toolbar wrapper `<div className="sticky top-0 …">` → `<div data-print-hide className="sticky top-0 …">`.

- [ ] **Step 3: Print CSS + chrome hook** — edit `app/globals.css` (append)

```css
@media print {
  /* Hide app chrome and any element opted out of print. */
  [data-app-chrome],
  [data-print-hide] {
    display: none !important;
  }
  /* Let the report use the full page. */
  main {
    max-width: none !important;
  }
}
```

And tag the app chrome so it's hidden when printing — edit `components/AppShell.tsx`: add `data-app-chrome` to the desktop rail `<aside …>` and the mobile top bar `<div …>`:
- Desktop rail: `<aside data-app-chrome className="sticky top-0 hidden h-screen border-r border-border lg:block">`
- Mobile top bar: `<div data-app-chrome className="sticky top-0 z-40 flex h-14 …">`

- [ ] **Step 4: Gate + commit**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: clean.

```bash
git add components/report/PrintButton.tsx "app/(app)/sprint/[id]/report/page.tsx" app/globals.css components/AppShell.tsx
git commit -m "feat(report): real Download PDF via print + print stylesheet"
```

---

## Task 6: Clickable stat cards (light polish)

**Files:** Modify `components/ui/StatCard.tsx`, `app/(app)/sprint/[id]/page.tsx`.

- [ ] **Step 1: Add optional `href`** — edit `components/ui/StatCard.tsx`

```tsx
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card } from "./Card";

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  href?: string;
}) {
  const body = (
    <Card className={"p-4" + (href ? " transition-colors hover:bg-surface-2" : "")}>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-text-3">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="font-mono text-3xl font-semibold tracking-tight tabular-nums">
        {value}
      </div>
      {sub ? <div className="mt-1 text-sm text-text-3">{sub}</div> : null}
    </Card>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
```

- [ ] **Step 2: Wire two dashboard stats** — edit `app/(app)/sprint/[id]/page.tsx`

In the `stats` array, add `href` to the Participation and Opportunities entries:
- Participation: `href: "/team"`
- Opportunities: `href: \`/sprint/${id}/report\``

Pass it through where the array is rendered: the `<StatCard ... />` map already spreads `label/value/sub/icon`; add `href={s.href}` to the JSX and `href?: string` to the array item shape (the array is inline `const stats = [ ... ]` — add `href` to the two entries; the others omit it).

- [ ] **Step 3: Gate + commit**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: clean.

```bash
git add components/ui/StatCard.tsx "app/(app)/sprint/[id]/page.tsx"
git commit -m "feat(manager): make Participation/Opportunities stat cards link out"
```

---

## Task 7: Full gate + browser verification + merge + push

- [ ] **Step 1: Full gate**

Run: `npm run typecheck && npm run lint && npm run test && npm run test:integration && npm run build`
Expected: all green. Unit +1 (landing); integration +1 (participant sessions).

- [ ] **Step 2: Browser-verify (after merge to main — preview runs from the main checkout)**
Verify as Marcus: sign-in lands on the **dashboard** (not /team); click any team row (active + idle) → participant page with session checklist + nudge; report "Download PDF" opens the print dialog with the nav rail hidden; resize to mobile → team shows cards, not a cramped table; stat cards Participation/Opportunities navigate; approve flow still works.

- [ ] **Step 3: Merge to main + push**

```bash
git -C /Users/fred/Documents/GitHub/atlas-project merge --no-ff <branch> -m "Merge: manager experience v1"
git -C /Users/fred/Documents/GitHub/atlas-project push origin main
```

---

## Self-Review

**Spec coverage:** 3.1 landing → Task 1; 3.2 participant detail + clickable rows → Tasks 2,3,4; 3.3 print → Task 5; 3.4 responsive team → Task 4; 3.5 stat cards → Task 6; verify/merge/push → Task 7. ✓

**Placeholders:** none — all code complete. The "verify import supports size/path" notes are confirmations against existing components, done at execution.

**Type consistency:** `landingPathFor(role: string)` used in Tasks 1 (dev + callback); `sprint.participant` return shape (adds `sessions: {topicTitle,status}[]` + `lastActiveLabel`) defined in Task 2 and consumed by the participant page (Task 3); `TeamProgress({sprintId, participants})` (Task 4) consumed by the dashboard; `NudgeComposer` props match its definition; `StatCard` gains optional `href` (Task 6) used by the dashboard. ✓
