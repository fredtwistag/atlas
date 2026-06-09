# Sprint Lifecycle + Finish Dashboard Rewiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a manager launch a sprint (topics + participants + sessions), let invited ICs see/complete real sessions on `/me`, and finish rewiring the final report and the Twistag cockpit onto real tenant data via tRPC + RLS.

**Architecture:** All reads/writes go through tRPC procedures running inside `withTenantContext` (tenant RLS) or a new `withTwistagContext` (cross-tenant reads via the existing `*_twistag_read` policies). The launch form posts to a thin server action that calls the `sprint.launch` mutation. Session completion uses a server action wrapping a testable core in `lib/sessions.ts`. The scripted conversation engine is unchanged — finishing a session just marks it complete (no captures written; that's the later LLM slice).

**Tech Stack:** Next.js 15 App Router (RSC + server actions), tRPC v11 + Zod, Drizzle ORM over postgres-js, Postgres RLS (Supabase), Vitest (unit + embedded-pg integration).

---

## Working agreements (read once)

- **Worktree:** all work happens in `/Users/fred/Documents/GitHub/atlas-lifecycle` on branch `backend-lifecycle`. `npm install` already run.
- **Gate after each task:** `npm run typecheck && npm run lint && npm run test`. Run `npm run test:integration` for tasks that touch DB/RLS/routers. Run `npm run build` before the final merge.
- **Commit scope:** commit only the files a task names (`git add <paths>`) to avoid sweeping the user's concurrent edits in the main checkout. We are in an isolated worktree, but stay disciplined.
- **Gotchas (carried from prior slices):**
  - `numeric` (`composite_score`) comes back as a **string** from postgres-js — coerce with `Number(...)` (already handled in `toOpportunity`).
  - Zod `z.string().uuid()` rejects non-v4 UUIDs — use valid v4 ids in tests (see existing `33333333-3333-4333-8333-...` style).
  - `timestamptz` columns come back as JS `Date` from drizzle/postgres-js.
  - Integration tests run on embedded-postgres (no Docker) via `npm run test:integration`; they `include: ["**/*.integration.test.ts"]` only.
  - Server Components read data via `server/trpc/caller.ts` `getApi()` (per-request caller).
  - `Date.now()` / `new Date()` are fine in app + test code (only forbidden inside Workflow scripts).

---

## File Structure

**New files:**
- `lib/topic-templates.ts` — the 4 default topic templates (constant + type).
- `lib/topic-templates.test.ts` — unit test for the constant.
- `lib/sessions.ts` — `completeSessionForUser(claims, sessionId)` core (testable, reused by the server action).
- `lib/sessions.integration.test.ts` — integration test for completion + cross-user isolation. *(distinct from the existing `db/sessions.integration.test.ts`)*
- `server/trpc/routers/session.ts` — `session.myDashboard`, `session.get`.
- `server/trpc/routers/twistag.ts` — `twistag.clientList`.
- `app/(app)/sprint/actions.ts` — `launchSprint(formData)` server action.
- `app/(app)/session/actions.ts` — `completeSession(sessionId)` server action.
- `components/sprint/LaunchSprintForm.tsx` — the launch form (server component, native form).
- `db/twistag-context.integration.test.ts` — `withTwistagContext` cross-tenant read test.

**Modified files:**
- `lib/schemas.ts` — add `LaunchSprintSchema`.
- `lib/types.ts` — add `MyDashboard` + `MySessionView`.
- `db/client.ts` — add `withTwistagContext`.
- `server/trpc/trpc.ts` — add `managerProcedure`, `twistagProcedure`.
- `server/trpc/routers/sprint.ts` — add `sprint.launch`.
- `server/trpc/routers/_app.ts` — mount `session` + `twistag` routers.
- `server/trpc/router.integration.test.ts` — add `sprint.launch` + procedure-gate cases.
- `components/session/ConversationView.tsx` — optional `onComplete` prop, fire on done.
- `app/(app)/sprint/page.tsx` — show launch form when no active sprint (manager/sponsor).
- `app/(app)/me/page.tsx` — read `session.myDashboard()`.
- `app/(app)/session/[id]/page.tsx` — read `session.get()`, pass `onComplete`.
- `app/(app)/sprint/[id]/report/page.tsx` — read real sprint/progress/opportunities.
- `app/(app)/twistag/page.tsx` — read `twistag.clientList()`.
- `db/seed-dashboard.ts` — also seed `sessions` for Northwind participants.

---

## Task 1: Topic templates constant + schema

**Files:**
- Create: `lib/topic-templates.ts`
- Create: `lib/topic-templates.test.ts`
- Modify: `lib/schemas.ts`

- [ ] **Step 1: Write the failing test** — `lib/topic-templates.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { TOPIC_TEMPLATES } from "./topic-templates";

describe("TOPIC_TEMPLATES", () => {
  it("has the four default discovery topics in order", () => {
    expect(TOPIC_TEMPLATES).toHaveLength(4);
    expect(TOPIC_TEMPLATES.map((t) => t.key)).toEqual([
      "how-work-flows",
      "when-things-break",
      "tools-and-systems",
      "one-change",
    ]);
    expect(TOPIC_TEMPLATES.map((t) => t.orderIdx)).toEqual([1, 2, 3, 4]);
  });

  it("every template has a non-empty title/description and positive counts", () => {
    for (const t of TOPIC_TEMPLATES) {
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.questionCount).toBeGreaterThan(0);
      expect(t.estMinutes).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- lib/topic-templates.test.ts`
Expected: FAIL — cannot resolve `./topic-templates`.

- [ ] **Step 3: Create the constant** — `lib/topic-templates.ts`

```ts
/**
 * The four default discovery topics a sprint launches with. Mirrors the demo
 * topics in lib/data.ts; the launch form pre-checks all four and the
 * sprint.launch mutation materializes the selected ones into `topics` rows.
 */
export interface TopicTemplate {
  key: string;
  title: string;
  description: string;
  orderIdx: number;
  questionCount: number;
  estMinutes: number;
}

export const TOPIC_TEMPLATES: TopicTemplate[] = [
  {
    key: "how-work-flows",
    title: "How work flows",
    description:
      "Walk through a normal order, end to end. Where does it move smoothly, where does it stall?",
    orderIdx: 1,
    questionCount: 5,
    estMinutes: 6,
  },
  {
    key: "when-things-break",
    title: "When things break",
    description:
      "The exceptions, the rush jobs, the manual fixes that never made it into a process doc.",
    orderIdx: 2,
    questionCount: 5,
    estMinutes: 6,
  },
  {
    key: "tools-and-systems",
    title: "Tools & systems",
    description:
      "What systems you touch, where they don't talk to each other, where the spreadsheets live.",
    orderIdx: 3,
    questionCount: 4,
    estMinutes: 5,
  },
  {
    key: "one-change",
    title: "One change",
    description:
      "If you could change one thing about how the team works, what would move the needle most?",
    orderIdx: 4,
    questionCount: 3,
    estMinutes: 4,
  },
];
```

- [ ] **Step 4: Add `LaunchSprintSchema`** — append to `lib/schemas.ts`

```ts
/** Manager launch-sprint form input. Validated in the server action + mutation. */
export const LaunchSprintSchema = z.object({
  name: z.string().min(3).max(120),
  primaryFocus: z.string().min(3).max(200),
  topicKeys: z.array(z.string()).min(1),
  participantIds: z.array(z.string().uuid()).min(1),
});
export type LaunchSprintInput = z.infer<typeof LaunchSprintSchema>;
```

- [ ] **Step 5: Add a schema unit test** — append to `lib/schemas.test.ts` (a new `describe`)

```ts
import { LaunchSprintSchema } from "./schemas";

describe("LaunchSprintSchema", () => {
  const ok = {
    name: "Operations Discovery",
    primaryFocus: "Quote-to-cash",
    topicKeys: ["how-work-flows"],
    participantIds: ["00000000-0000-4000-8000-000000000001"],
  };

  it("accepts a valid launch payload", () => {
    expect(LaunchSprintSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects empty topic or participant lists", () => {
    expect(
      LaunchSprintSchema.safeParse({ ...ok, topicKeys: [] }).success,
    ).toBe(false);
    expect(
      LaunchSprintSchema.safeParse({ ...ok, participantIds: [] }).success,
    ).toBe(false);
  });

  it("rejects a non-uuid participant id", () => {
    expect(
      LaunchSprintSchema.safeParse({ ...ok, participantIds: ["nope"] }).success,
    ).toBe(false);
  });
});
```

> NOTE: `lib/schemas.test.ts` already imports from `vitest` and `./schemas`. If the file does not yet import `describe/it/expect`, add `import { describe, it, expect } from "vitest";` at the top and merge the `LaunchSprintSchema` import into the existing `./schemas` import line. Read the file first.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test -- lib/topic-templates.test.ts lib/schemas.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add lib/topic-templates.ts lib/topic-templates.test.ts lib/schemas.ts lib/schemas.test.ts
git commit -m "feat(lifecycle): topic templates + launch-sprint schema"
```

---

## Task 2: Manager + Twistag procedures

**Files:**
- Modify: `server/trpc/trpc.ts`

- [ ] **Step 1: Add the procedures** — append to `server/trpc/trpc.ts` (after `tenantProcedure`)

```ts
/** Requires a tenant session with a manager/sponsor role (launch + admin actions). */
export const managerProcedure = t.procedure.use(({ ctx, next }) => {
  if (
    !ctx.session ||
    ctx.session.kind !== "tenant" ||
    !(ctx.session.role === "manager" || ctx.session.role === "sponsor")
  ) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx: { session: ctx.session } });
});

/** Requires a Twistag (cross-tenant) session. */
export const twistagProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session || ctx.session.kind !== "twistag") {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { session: ctx.session } });
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean (no consumers yet).

- [ ] **Step 3: Commit**

```bash
git add server/trpc/trpc.ts
git commit -m "feat(trpc): managerProcedure + twistagProcedure gates"
```

---

## Task 3: `sprint.launch` mutation

**Files:**
- Modify: `server/trpc/routers/sprint.ts`
- Modify: `server/trpc/router.integration.test.ts`

- [ ] **Step 1: Write the failing integration test** — add to `server/trpc/router.integration.test.ts`

Add these imports at the top (merge with existing import lines):

```ts
import { users, sprintParticipants, sessions, topics } from "@/db/schema";
import { LaunchSprintSchema } from "@/lib/schemas";
import { asUser } from "@/db/test/helpers";
```

Add valid-v4 user ids + a manager-session helper near the other consts:

```ts
const MGR_A = "44444444-4444-4444-8444-44444444a001";
const IC_A1 = "44444444-4444-4444-8444-44444444a002";
const IC_A2 = "44444444-4444-4444-8444-44444444a003";

const asManager = (tenantId: string, userId: string) =>
  createCaller({
    session: { kind: "tenant", tenantId, userId, role: "manager" },
  });
```

Add a new `describe` block (do not disturb the existing one):

```ts
describe("sprint.launch", () => {
  beforeEach(async () => {
    // resetDb()/seedTenants() already ran in the outer beforeEach; add users.
    await seedRow((tx) =>
      tx.insert(users).values([
        { id: MGR_A, tenantId: TENANT_A, email: "mgr@a.example", name: "Mgr A", role: "manager", department: "Ops" },
        { id: IC_A1, tenantId: TENANT_A, email: "ic1@a.example", name: "IC One", role: "ic", department: "Finance" },
        { id: IC_A2, tenantId: TENANT_A, email: "ic2@a.example", name: "IC Two", role: "ic", department: "Sales" },
      ]),
    );
  });

  it("creates sprint + topics + participants + sessions for the manager's tenant", async () => {
    const api = asManager(TENANT_A, MGR_A);
    const sprintId = await api.sprint.launch({
      name: "Ops Discovery",
      primaryFocus: "Quote-to-cash",
      topicKeys: ["how-work-flows", "when-things-break"],
      participantIds: [IC_A1, IC_A2],
    });
    expect(typeof sprintId).toBe("string");

    // Read back as tenant A (RLS-scoped).
    const topicRows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(topics),
    );
    expect(topicRows).toHaveLength(2);

    const partRows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(sprintParticipants),
    );
    expect(partRows).toHaveLength(2);
    expect(partRows.every((p) => p.sessionsTotal === 2)).toBe(true);
    expect(partRows.every((p) => p.status === "not_started")).toBe(true);

    const sessionRows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(sessions),
    );
    // 2 participants x 2 topics
    expect(sessionRows).toHaveLength(4);
    expect(sessionRows.every((s) => s.status === "not_started")).toBe(true);
  });

  it("isolates tenants — A cannot see a sprint B launched", async () => {
    // Seed a manager + IC in tenant B.
    const MGR_B = "44444444-4444-4444-8444-44444444b001";
    const IC_B1 = "44444444-4444-4444-8444-44444444b002";
    await seedRow((tx) =>
      tx.insert(users).values([
        { id: MGR_B, tenantId: TENANT_B, email: "mgr@b.example", name: "Mgr B", role: "manager", department: "Ops" },
        { id: IC_B1, tenantId: TENANT_B, email: "ic1@b.example", name: "IC B", role: "ic", department: "Ops" },
      ]),
    );
    await asManager(TENANT_B, MGR_B).sprint.launch({
      name: "B Sprint",
      primaryFocus: "B focus",
      topicKeys: ["one-change"],
      participantIds: [IC_B1],
    });

    // Tenant A sees none of B's topics/participants/sessions.
    const aTopics = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(topics),
    );
    expect(aTopics).toHaveLength(0);
  });

  it("rejects an IC session (managerProcedure)", async () => {
    const api = createCaller({
      session: { kind: "tenant", tenantId: TENANT_A, userId: IC_A1, role: "ic" },
    });
    await expect(
      api.sprint.launch({
        name: "x",
        primaryFocus: "y",
        topicKeys: ["one-change"],
        participantIds: [IC_A1],
      }),
    ).rejects.toThrow();
  });
});
```

> The validation that `name`/`primaryFocus` need `min(3)` lives in the Zod schema (Task 1) — the mutation `.input(LaunchSprintSchema)` enforces it. The IC-reject test uses `name:"x"` which would also fail Zod, but the procedure gate fires first; either way it rejects. Keep it as written.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:integration -- server/trpc/router.integration.test.ts`
Expected: FAIL — `api.sprint.launch` is not a function.

- [ ] **Step 3: Implement `sprint.launch`** — edit `server/trpc/routers/sprint.ts`

Update the imports block:

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, inArray } from "drizzle-orm";
import { router, tenantProcedure, managerProcedure } from "../trpc";
import { withTenantContext } from "@/db/client";
import {
  sprints,
  topics,
  sprintParticipants,
  sessions,
  users,
  tenants,
  opportunities,
  captures,
} from "@/db/schema";
import { computeProgress } from "@/lib/dashboard-map";
import { TOPIC_TEMPLATES } from "@/lib/topic-templates";
import { LaunchSprintSchema } from "@/lib/schemas";
import type {
  Sprint,
  Participant,
  SprintProgress,
  ActivityItem,
} from "@/lib/types";
```

Add the `launch` procedure inside `router({ ... })` (e.g. right after `currentForTenant`):

```ts
  launch: managerProcedure.input(LaunchSprintSchema).mutation(({ ctx, input }) =>
    withTenantContext(ctx.session, async (tx): Promise<string> => {
      const selectedTemplates = TOPIC_TEMPLATES.filter((t) =>
        input.topicKeys.includes(t.key),
      );
      if (selectedTemplates.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Pick at least one topic." });
      }

      // Selected members (for sponsorId + scope_department).
      const members = await tx
        .select({ id: users.id, role: users.role, department: users.department })
        .from(users)
        .where(inArray(users.id, input.participantIds));
      const sponsorId = members.find((m) => m.role === "sponsor")?.id ?? null;
      const scope = Array.from(
        new Set(members.map((m) => m.department).filter((d): d is string => !!d)),
      ).join(", ");

      const start = new Date();
      const end = new Date(start.getTime() + 24 * DAY);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);

      const [sprint] = await tx
        .insert(sprints)
        .values({
          tenantId: ctx.session.tenantId,
          name: input.name,
          primaryFocus: input.primaryFocus,
          scopeDepartment: scope || null,
          startDate: fmt(start),
          endDate: fmt(end),
          cadence: "weekly",
          status: "active",
          managerId: ctx.session.userId,
          sponsorId,
        })
        .returning({ id: sprints.id });

      const topicRows = await tx
        .insert(topics)
        .values(
          selectedTemplates.map((t) => ({
            tenantId: ctx.session.tenantId,
            sprintId: sprint.id,
            title: t.title,
            description: t.description,
            orderIdx: t.orderIdx,
            questionCount: t.questionCount,
            estMinutes: t.estMinutes,
          })),
        )
        .returning({ id: topics.id });

      await tx.insert(sprintParticipants).values(
        input.participantIds.map((userId) => ({
          tenantId: ctx.session.tenantId,
          sprintId: sprint.id,
          userId,
          status: "not_started",
          sessionsCompleted: 0,
          sessionsTotal: topicRows.length,
          lastActiveLabel: "Invited · not started",
        })),
      );

      const sessionValues = input.participantIds.flatMap((userId) =>
        topicRows.map((t) => ({
          tenantId: ctx.session.tenantId,
          sprintId: sprint.id,
          topicId: t.id,
          userId,
          status: "not_started",
        })),
      );
      await tx.insert(sessions).values(sessionValues);

      return sprint.id;
    }),
  ),
```

- [ ] **Step 4: Run the integration test to verify it passes**

Run: `npm run test:integration -- server/trpc/router.integration.test.ts`
Expected: PASS (existing isolation tests + the 3 new launch tests).

- [ ] **Step 5: Typecheck + lint + unit tests**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: clean / green.

- [ ] **Step 6: Commit**

```bash
git add server/trpc/routers/sprint.ts server/trpc/router.integration.test.ts
git commit -m "feat(trpc): sprint.launch creates sprint+topics+participants+sessions"
```

---

## Task 4: Launch form + server action + `/sprint` wiring

**Files:**
- Create: `app/(app)/sprint/actions.ts`
- Create: `components/sprint/LaunchSprintForm.tsx`
- Modify: `app/(app)/sprint/page.tsx`

- [ ] **Step 1: Create the server action** — `app/(app)/sprint/actions.ts`

```ts
"use server";

import { redirect } from "next/navigation";
import { getApi } from "@/server/trpc/caller";
import { LaunchSprintSchema } from "@/lib/schemas";

/** Manager submits the launch form → creates the sprint → redirect to it. */
export async function launchSprint(formData: FormData): Promise<void> {
  const parsed = LaunchSprintSchema.safeParse({
    name: formData.get("name"),
    primaryFocus: formData.get("primaryFocus"),
    topicKeys: formData.getAll("topicKeys"),
    participantIds: formData.getAll("participantIds"),
  });
  if (!parsed.success) {
    redirect("/sprint?error=invalid");
  }

  const api = await getApi();
  const sprintId = await api.sprint.launch(parsed.data);
  redirect(`/sprint/${sprintId}`);
}
```

> `redirect()` throws internally; do not wrap the `api.sprint.launch` call in a try that swallows it. If launch throws (e.g. forbidden), let it surface to the error boundary.

- [ ] **Step 2: Create the form component** — `components/sprint/LaunchSprintForm.tsx`

```tsx
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { TOPIC_TEMPLATES } from "@/lib/topic-templates";
import { launchSprint } from "@/app/(app)/sprint/actions";

export interface LaunchFormMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function LaunchSprintForm({
  members,
  invalid,
}: {
  members: LaunchFormMember[];
  invalid?: boolean;
}) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          Launch a discovery sprint
        </h1>
        <p className="mt-1.5 text-md text-text-2">
          Name the sprint, pick the topics, and choose who takes part. Everyone
          you select gets their own short sessions, on their own schedule.
        </p>
      </div>

      {invalid && (
        <div className="mb-5 rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 text-md text-danger">
          Check the fields — you need a name, a focus, at least one topic, and
          at least one participant.
        </div>
      )}

      <form action={launchSprint} className="space-y-6">
        <Card className="space-y-4 p-5">
          <div>
            <Label htmlFor="name">Sprint name</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue="Operations Discovery"
              placeholder="Operations Discovery — Spring '26"
            />
          </div>
          <div>
            <Label htmlFor="primaryFocus">Primary focus</Label>
            <Input
              id="primaryFocus"
              name="primaryFocus"
              required
              placeholder="Quote-to-cash & exception handling"
            />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-md font-semibold">Topics</h2>
          <p className="mb-3 text-sm text-text-3">
            The conversations each participant will have. All four are
            recommended.
          </p>
          <div className="space-y-2">
            {TOPIC_TEMPLATES.map((t) => (
              <label
                key={t.key}
                className="flex cursor-pointer items-start gap-3 rounded border border-border bg-bg px-3 py-2.5"
              >
                <input
                  type="checkbox"
                  name="topicKeys"
                  value={t.key}
                  defaultChecked
                  className="mt-1 h-4 w-4 accent-brand"
                />
                <span>
                  <span className="block text-sm font-medium">{t.title}</span>
                  <span className="block text-xs text-text-3">
                    {t.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-md font-semibold">Participants</h2>
          <p className="mb-3 text-sm text-text-3">
            {members.length === 0
              ? "No one to invite yet — add your team first."
              : "Everyone here is included by default. Uncheck anyone who shouldn't take part."}
          </p>
          <div className="space-y-2">
            {members.map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer items-center gap-3 rounded border border-border bg-bg px-3 py-2.5"
              >
                <input
                  type="checkbox"
                  name="participantIds"
                  value={m.id}
                  defaultChecked
                  className="h-4 w-4 accent-brand"
                />
                <span className="flex-1">
                  <span className="text-sm font-medium">{m.name}</span>
                  <span className="ml-2 text-xs text-text-3">{m.email}</span>
                </span>
                <span className="text-xs text-text-3">{m.role}</span>
              </label>
            ))}
          </div>
          {members.length === 0 && (
            <a
              href="/team"
              className="mt-3 inline-block text-sm font-medium text-brand hover:text-brand-hover"
            >
              Go to your team →
            </a>
          )}
        </Card>

        <Button
          type="submit"
          variant="brand"
          size="lg"
          disabled={members.length === 0}
        >
          Launch sprint
        </Button>
      </form>
    </main>
  );
}
```

> Verify the `Button` component accepts `size="lg"` and `disabled` (the `/me` page uses `ButtonLink ... size="lg"`, and `ConversationView` uses `Button ... disabled`). If `Button` does not support `disabled` natively, read `components/ui/Button.tsx` and adjust. Confirm `accent-brand` resolves; if not, the checkbox still works visually — leave a plain checkbox.

- [ ] **Step 3: Wire `/sprint` page** — replace `app/(app)/sprint/page.tsx`

```tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getApi } from "@/server/trpc/caller";
import { withTenantContext } from "@/db/client";
import { users } from "@/db/schema";
import { ne } from "drizzle-orm";
import { LaunchSprintForm } from "@/components/sprint/LaunchSprintForm";

export const dynamic = "force-dynamic";

export default async function SprintIndex({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (session.kind !== "tenant") redirect("/admin");

  const api = await getApi();
  const id = await api.sprint.currentForTenant();
  if (id) redirect(`/sprint/${id}`);

  // No active sprint. ICs see a wait message; managers/sponsors see the form.
  if (!(session.role === "manager" || session.role === "sponsor")) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          No active sprint yet
        </h1>
        <p className="mt-2 text-md text-text-2">
          Your organization doesn&apos;t have a discovery sprint running yet.
          Once your manager launches one, it&apos;ll appear here.
        </p>
      </main>
    );
  }

  const members = await withTenantContext(session, (tx) =>
    tx
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(ne(users.role, "manager")),
  );

  const { error } = await searchParams;
  return <LaunchSprintForm members={members} invalid={error === "invalid"} />;
}
```

- [ ] **Step 4: Typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: clean. (`build` catches RSC/server-action wiring issues.)

- [ ] **Step 5: Commit**

```bash
git add app/(app)/sprint/actions.ts components/sprint/LaunchSprintForm.tsx app/(app)/sprint/page.tsx
git commit -m "feat(sprint): manager launch form + launchSprint action"
```

> Browser verification of the launch flow happens in Task 7 (after `/me` is real), so we can launch → see participants → sign in as an IC → complete a session in one pass.

---

## Task 5: `session.myDashboard` + `session.get`

**Files:**
- Modify: `lib/types.ts`
- Create: `server/trpc/routers/session.ts`
- Modify: `server/trpc/routers/_app.ts`
- Modify: `server/trpc/router.integration.test.ts`

- [ ] **Step 1: Add the view types** — append to `lib/types.ts`

```ts
export interface MySessionView {
  id: string;
  topicId: string;
  topicTitle: string;
  topicDescription: string;
  estMinutes: number;
  status: SessionStatus;
  completedAt: string | null;
  editWindowEndsAt: string | null;
  captureCount: number;
  totalSeconds: number | null;
}

export interface MyDashboard {
  sprintId: string;
  sprintName: string;
  tenantName: string;
  sessions: MySessionView[];
}
```

- [ ] **Step 2: Write the failing integration test** — add a `describe` to `server/trpc/router.integration.test.ts`

Add imports (merge with existing): `sessions`, `topics`, `sprintParticipants`, `users` are already imported by Task 3. Add a tenant-user caller helper near the top:

```ts
const IC_VIEW = "55555555-5555-4555-8555-55555555a001";
const asIc = (tenantId: string, userId: string) =>
  createCaller({
    session: { kind: "tenant", tenantId, userId, role: "ic" },
  });
```

```ts
describe("session.myDashboard / session.get", () => {
  const TOPIC_ID = "55555555-5555-4555-8555-55555555a010";
  const SES_ID = "55555555-5555-4555-8555-55555555a020";

  beforeEach(async () => {
    await seedRow((tx) =>
      tx.insert(users).values({
        id: IC_VIEW, tenantId: TENANT_A, email: "view@a.example",
        name: "Viewer", role: "ic", department: "Ops",
      }),
    );
    // SPRINT_A already exists (outer beforeEach). Add a topic, participant, session.
    await seedRow((tx) =>
      tx.insert(topics).values({
        id: TOPIC_ID, tenantId: TENANT_A, sprintId: SPRINT_A,
        title: "How work flows", description: "desc", orderIdx: 1,
        questionCount: 5, estMinutes: 6,
      }),
    );
    await seedRow((tx) =>
      tx.insert(sprintParticipants).values({
        tenantId: TENANT_A, sprintId: SPRINT_A, userId: IC_VIEW,
        status: "not_started", sessionsCompleted: 0, sessionsTotal: 1,
      }),
    );
    await seedRow((tx) =>
      tx.insert(sessions).values({
        id: SES_ID, tenantId: TENANT_A, sprintId: SPRINT_A,
        topicId: TOPIC_ID, userId: IC_VIEW, status: "not_started",
      }),
    );
  });

  it("returns the IC's active sprint sessions", async () => {
    const data = await asIc(TENANT_A, IC_VIEW).session.myDashboard();
    expect(data).not.toBeNull();
    expect(data!.sprintId).toBe(SPRINT_A);
    expect(data!.sessions).toHaveLength(1);
    expect(data!.sessions[0].topicTitle).toBe("How work flows");
  });

  it("returns null for a user who is not a participant", async () => {
    const other = "55555555-5555-4555-8555-55555555a099";
    await seedRow((tx) =>
      tx.insert(users).values({
        id: other, tenantId: TENANT_A, email: "no@a.example",
        name: "No", role: "ic", department: "Ops",
      }),
    );
    const data = await asIc(TENANT_A, other).session.myDashboard();
    expect(data).toBeNull();
  });

  it("session.get returns the topic title for the owning tenant", async () => {
    const s = await asIc(TENANT_A, IC_VIEW).session.get({ id: SES_ID });
    expect(s.topicTitle).toBe("How work flows");
  });

  it("session.get is blocked cross-tenant (NOT_FOUND under RLS)", async () => {
    await expect(
      asIc(TENANT_B, IC_VIEW).session.get({ id: SES_ID }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test:integration -- server/trpc/router.integration.test.ts`
Expected: FAIL — `api.session` is undefined.

- [ ] **Step 4: Create the session router** — `server/trpc/routers/session.ts`

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { router, tenantProcedure } from "../trpc";
import { withTenantContext } from "@/db/client";
import { sprints, topics, sessions, sprintParticipants, tenants } from "@/db/schema";
import type { MyDashboard, SessionStatus } from "@/lib/types";

function fmtTs(d: Date | null): string | null {
  if (!d) return null;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export const sessionRouter = router({
  myDashboard: tenantProcedure.query(({ ctx }) =>
    withTenantContext(ctx.session, async (tx): Promise<MyDashboard | null> => {
      const [part] = await tx
        .select({ sprintId: sprintParticipants.sprintId })
        .from(sprintParticipants)
        .innerJoin(sprints, eq(sprintParticipants.sprintId, sprints.id))
        .where(
          and(
            eq(sprintParticipants.userId, ctx.session.userId),
            eq(sprints.status, "active"),
          ),
        )
        .orderBy(desc(sprints.createdAt))
        .limit(1);
      if (!part) return null;

      const [s] = await tx
        .select({ name: sprints.name, tenantId: sprints.tenantId })
        .from(sprints)
        .where(eq(sprints.id, part.sprintId));
      const [tenant] = await tx
        .select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, s.tenantId));

      const rows = await tx
        .select({
          id: sessions.id,
          topicId: sessions.topicId,
          status: sessions.status,
          completedAt: sessions.completedAt,
          editWindowEndsAt: sessions.editWindowEndsAt,
          captureCount: sessions.captureCount,
          totalSeconds: sessions.totalSeconds,
          topicTitle: topics.title,
          topicDescription: topics.description,
          estMinutes: topics.estMinutes,
        })
        .from(sessions)
        .leftJoin(topics, eq(sessions.topicId, topics.id))
        .where(
          and(
            eq(sessions.sprintId, part.sprintId),
            eq(sessions.userId, ctx.session.userId),
          ),
        )
        .orderBy(topics.orderIdx);

      return {
        sprintId: part.sprintId,
        sprintName: s.name,
        tenantName: tenant?.name ?? "",
        sessions: rows.map((r) => ({
          id: r.id,
          topicId: r.topicId ?? "",
          topicTitle: r.topicTitle ?? "Discovery session",
          topicDescription: r.topicDescription ?? "",
          estMinutes: r.estMinutes ?? 0,
          status: r.status as SessionStatus,
          completedAt: fmtTs(r.completedAt),
          editWindowEndsAt: fmtTs(r.editWindowEndsAt),
          captureCount: r.captureCount,
          totalSeconds: r.totalSeconds,
        })),
      };
    }),
  ),

  get: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) =>
      withTenantContext(ctx.session, async (tx) => {
        const [row] = await tx
          .select({ id: sessions.id, topicTitle: topics.title })
          .from(sessions)
          .leftJoin(topics, eq(sessions.topicId, topics.id))
          .where(eq(sessions.id, input.id));
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        return { id: row.id, topicTitle: row.topicTitle ?? "Discovery session" };
      }),
    ),
});
```

- [ ] **Step 5: Mount the router** — edit `server/trpc/routers/_app.ts`

```ts
import { router } from "../trpc";
import { sprintRouter } from "./sprint";
import { opportunityRouter } from "./opportunity";
import { sessionRouter } from "./session";

export const appRouter = router({
  sprint: sprintRouter,
  opportunity: opportunityRouter,
  session: sessionRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 6: Run integration test to verify it passes**

Run: `npm run test:integration -- server/trpc/router.integration.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add lib/types.ts server/trpc/routers/session.ts server/trpc/routers/_app.ts server/trpc/router.integration.test.ts
git commit -m "feat(trpc): session.myDashboard + session.get on real data"
```

---

## Task 6: Session completion core

**Files:**
- Create: `lib/sessions.ts`
- Create: `lib/sessions.integration.test.ts`

- [ ] **Step 1: Write the failing integration test** — `lib/sessions.integration.test.ts`

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { eq, and } from "drizzle-orm";
import { sprints, users, topics, sessions, sprintParticipants } from "@/db/schema";
import {
  asUser,
  seedRow,
  resetDb,
  seedTenants,
  TENANT_A,
} from "@/db/test/helpers";
import { completeSessionForUser } from "./sessions";

const USER = "66666666-6666-4666-8666-66666666a001";
const OTHER = "66666666-6666-4666-8666-66666666a002";
const SPRINT = "66666666-6666-4666-8666-66666666a010";
const TOPIC = "66666666-6666-4666-8666-66666666a020";
const SES = "66666666-6666-4666-8666-66666666a030";

beforeEach(async () => {
  await resetDb();
  await seedTenants();
  await seedRow((tx) =>
    tx.insert(users).values([
      { id: USER, tenantId: TENANT_A, email: "u@a.example", name: "U", role: "ic", department: "Ops" },
      { id: OTHER, tenantId: TENANT_A, email: "o@a.example", name: "O", role: "ic", department: "Ops" },
    ]),
  );
  await seedRow((tx) =>
    tx.insert(sprints).values({
      id: SPRINT, tenantId: TENANT_A, name: "S", primaryFocus: "ops",
      startDate: "2026-05-18", endDate: "2026-06-12", cadence: "weekly", status: "active",
    }),
  );
  await seedRow((tx) =>
    tx.insert(topics).values({
      id: TOPIC, tenantId: TENANT_A, sprintId: SPRINT, title: "T",
      description: "d", orderIdx: 1, questionCount: 3, estMinutes: 5,
    }),
  );
  await seedRow((tx) =>
    tx.insert(sprintParticipants).values({
      tenantId: TENANT_A, sprintId: SPRINT, userId: USER,
      status: "not_started", sessionsCompleted: 0, sessionsTotal: 1,
    }),
  );
  await seedRow((tx) =>
    tx.insert(sessions).values({
      id: SES, tenantId: TENANT_A, sprintId: SPRINT, topicId: TOPIC,
      userId: USER, status: "not_started",
    }),
  );
});

describe("completeSessionForUser", () => {
  it("marks the session complete and bumps participant progress", async () => {
    await completeSessionForUser(
      { tenantId: TENANT_A, userId: USER, role: "ic" },
      SES,
    );

    const [ses] = await asUser({ tenantId: TENANT_A, userId: USER }, (tx) =>
      tx.select().from(sessions).where(eq(sessions.id, SES)),
    );
    expect(ses.status).toBe("completed");
    expect(ses.completedAt).not.toBeNull();
    expect(ses.editWindowEndsAt).not.toBeNull();

    const [part] = await asUser({ tenantId: TENANT_A, userId: USER }, (tx) =>
      tx
        .select()
        .from(sprintParticipants)
        .where(
          and(
            eq(sprintParticipants.sprintId, SPRINT),
            eq(sprintParticipants.userId, USER),
          ),
        ),
    );
    expect(part.sessionsCompleted).toBe(1);
    expect(part.status).toBe("completed"); // 1 of 1 total
  });

  it("does not complete another user's session", async () => {
    await expect(
      completeSessionForUser(
        { tenantId: TENANT_A, userId: OTHER, role: "ic" },
        SES,
      ),
    ).rejects.toThrow();

    const [ses] = await asUser({ tenantId: TENANT_A, userId: USER }, (tx) =>
      tx.select().from(sessions).where(eq(sessions.id, SES)),
    );
    expect(ses.status).toBe("not_started");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:integration -- lib/sessions.integration.test.ts`
Expected: FAIL — cannot resolve `./sessions`.

- [ ] **Step 3: Implement the core** — `lib/sessions.ts`

```ts
/**
 * Session lifecycle core — completing a discovery session. Kept out of the
 * "use server" action file so it is directly unit/integration-testable.
 * Server-only (uses the DB client + tenant RLS).
 */
import { and, eq } from "drizzle-orm";
import { withTenantContext, type TenantClaims } from "@/db/client";
import { sessions, sprintParticipants } from "@/db/schema";

const WEEK_MS = 7 * 86_400_000;

/**
 * Mark `sessionId` complete for the signed-in user, set the 7-day edit window,
 * and recompute that participant's progress. Throws if the session isn't the
 * user's (RLS scopes the tenant; the user_id predicate scopes ownership).
 */
export async function completeSessionForUser(
  claims: TenantClaims,
  sessionId: string,
): Promise<void> {
  await withTenantContext(claims, async (tx) => {
    const now = new Date();
    const editEnds = new Date(now.getTime() + WEEK_MS);

    const updated = await tx
      .update(sessions)
      .set({ status: "completed", completedAt: now, editWindowEndsAt: editEnds })
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, claims.userId)))
      .returning({ sprintId: sessions.sprintId });

    if (updated.length === 0) {
      throw new Error("Session not found for this user.");
    }
    const sprintId = updated[0].sprintId;

    const completed = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.sprintId, sprintId),
          eq(sessions.userId, claims.userId),
          eq(sessions.status, "completed"),
        ),
      );

    const [part] = await tx
      .select({ total: sprintParticipants.sessionsTotal })
      .from(sprintParticipants)
      .where(
        and(
          eq(sprintParticipants.sprintId, sprintId),
          eq(sprintParticipants.userId, claims.userId),
        ),
      );

    const count = completed.length;
    const status = part && count >= part.total ? "completed" : "in_progress";

    await tx
      .update(sprintParticipants)
      .set({ sessionsCompleted: count, status })
      .where(
        and(
          eq(sprintParticipants.sprintId, sprintId),
          eq(sprintParticipants.userId, claims.userId),
        ),
      );
  });
}
```

- [ ] **Step 4: Run integration test to verify it passes**

Run: `npm run test:integration -- lib/sessions.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/sessions.ts lib/sessions.integration.test.ts
git commit -m "feat(sessions): completeSessionForUser core + ownership isolation test"
```

---

## Task 7: Rewire `/me` + session page + ConversationView, then browser-verify the full IC loop

**Files:**
- Create: `app/(app)/session/actions.ts`
- Modify: `components/session/ConversationView.tsx`
- Modify: `app/(app)/session/[id]/page.tsx`
- Modify: `app/(app)/me/page.tsx`

- [ ] **Step 1: Create the completion action** — `app/(app)/session/actions.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { completeSessionForUser } from "@/lib/sessions";

/** Called from ConversationView when a scripted session reaches "done". */
export async function completeSession(sessionId: string): Promise<void> {
  const session = await getSession();
  if (!session || session.kind !== "tenant") {
    throw new Error("forbidden");
  }
  await completeSessionForUser(
    {
      tenantId: session.tenantId,
      userId: session.userId,
      role: session.role,
    },
    sessionId,
  );
  revalidatePath("/me");
}
```

- [ ] **Step 2: Add `onComplete` to ConversationView** — edit `components/session/ConversationView.tsx`

Update the React import to include `useEffect` (already imported) and `useRef` (already imported). Change the component signature + add the effect.

Replace the signature block:

```tsx
export function ConversationView({
  sessionId,
  topicTitle,
  onComplete,
}: {
  sessionId: string;
  topicTitle: string;
  onComplete?: (sessionId: string) => Promise<void>;
}) {
```

Add a ref next to the other refs (after `const threadRef = useRef<HTMLDivElement>(null);`):

```tsx
  const completedRef = useRef(false);
```

Add this effect after the existing scroll `useEffect`:

```tsx
  useEffect(() => {
    if (done && !completedRef.current && onComplete) {
      completedRef.current = true;
      void onComplete(sessionId);
    }
  }, [done, onComplete, sessionId]);
```

> The existing `ConversationView.test.tsx` renders `<ConversationView sessionId="ses-4" topicTitle="One change" />` with **no** `onComplete`, so the effect is a no-op there and the test stays green. Do not remove the "sessionId is part of the public API" comment is now obsolete — delete that stale comment block above the destructure if present.

- [ ] **Step 3: Rewire the session page** — replace `app/(app)/session/[id]/page.tsx`

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConversationView } from "@/components/session/ConversationView";
import { getApi } from "@/server/trpc/caller";
import { completeSession } from "../actions";

export const metadata: Metadata = { title: "Discovery session · Atlas" };
export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const api = await getApi();
  const session = await api.session.get({ id }).catch(() => null);
  if (!session) notFound();

  return (
    <ConversationView
      sessionId={session.id}
      topicTitle={session.topicTitle}
      onComplete={completeSession}
    />
  );
}
```

- [ ] **Step 4: Rewire `/me`** — replace `app/(app)/me/page.tsx`

```tsx
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Clock,
  Lock,
  Pencil,
  ShieldCheck,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ButtonLink } from "@/components/ui/Button";
import type { Metadata } from "next";
import { getApi } from "@/server/trpc/caller";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "My sprint · Atlas" };
export const dynamic = "force-dynamic";

export default async function IcHomePage() {
  const me = await getCurrentUser();
  const api = await getApi();
  const data = await api.session.myDashboard();

  if (!data || data.sessions.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          You&apos;re not in an active sprint yet
        </h1>
        <p className="mt-2 text-md text-text-2">
          When your manager launches a discovery sprint and adds you, your
          sessions will show up here.
        </p>
      </main>
    );
  }

  const sessions = data.sessions;
  const completed = sessions.filter((s) => s.status === "completed");
  const next = sessions.find((s) => s.status !== "completed");
  const doneCount = completed.length;
  const totalCount = sessions.length;
  const pct = Math.round((doneCount / totalCount) * 100);
  const minutesLeft = sessions
    .filter((s) => s.status !== "completed")
    .reduce((sum, s) => sum + s.estMinutes, 0);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      {/* Greeting */}
      <div className="mb-8">
        <div className="mb-1 text-sm font-medium text-text-3">
          {data.tenantName} · {data.sprintName}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome back, {me.name.split(" ")[0]}.
        </h1>
        <p className="mt-1.5 text-md text-text-2">
          {doneCount === totalCount
            ? "You're all done — thank you. You can still review and edit anything below."
            : `You're ${doneCount} of ${totalCount} sessions in. About ${minutesLeft} minutes of your time left, whenever it suits you.`}
        </p>
      </div>

      {/* Progress pills */}
      <Card className="mb-6 p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-text-2">Your sprint</span>
          <span className="text-sm text-text-3">
            {doneCount}/{totalCount} complete
          </span>
        </div>
        <ProgressBar value={pct} className="mb-4" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {sessions.map((s, i) => {
            const isCurrent = s.id === next?.id;
            return (
              <div
                key={s.id}
                className="flex items-center gap-2 rounded border border-border bg-bg px-2.5 py-2"
              >
                <span
                  className={
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full " +
                    (s.status === "completed"
                      ? "bg-success text-white"
                      : isCurrent
                        ? "bg-brand text-white"
                        : "bg-surface-2 text-text-3")
                  }
                >
                  {s.status === "completed" ? (
                    <Check className="h-3 w-3" />
                  ) : isCurrent ? (
                    <span className="text-[10px] font-semibold">{i + 1}</span>
                  ) : (
                    <Lock className="h-2.5 w-2.5" />
                  )}
                </span>
                <span className="truncate text-[12.5px] font-medium leading-tight">
                  {s.topicTitle}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Next session CTA */}
      {next && (
        <Card className="mb-6 overflow-hidden border-brand/30">
          <div className="bg-brand-soft px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-brand">
                  Up next
                </div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  {next.topicTitle}
                </h2>
                <p className="mt-1.5 max-w-md text-md text-text-2">
                  {next.topicDescription}
                </p>
                <div className="mt-3 flex items-center gap-1.5 text-sm text-text-2">
                  <Clock className="h-3.5 w-3.5" />
                  About {next.estMinutes} minutes
                </div>
              </div>
            </div>
            <ButtonLink
              href={`/session/${next.id}`}
              variant="brand"
              size="lg"
              className="mt-5"
            >
              Start session <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </div>
        </Card>
      )}

      {/* Completed sessions */}
      {completed.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-3 px-1 text-sm font-semibold text-text-2">
            Completed
          </h3>
          <div className="space-y-2">
            {completed.map((s) => (
              <Card
                key={s.id}
                className="flex items-center justify-between gap-4 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{s.topicTitle}</span>
                    <Badge tone="success">
                      <Check className="h-3 w-3" /> Done
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-sm text-text-3">
                    {s.completedAt} · {s.captureCount} things captured ·{" "}
                    {Math.round((s.totalSeconds ?? 0) / 60)} min
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="hidden text-xs text-text-3 sm:inline">
                    Editable until {s.editWindowEndsAt}
                  </span>
                  <Link
                    href={`/me/sessions/${s.id}/edit`}
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:text-brand-hover"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Review &amp; edit
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Privacy reassurance */}
      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        <p>
          What you say is attributed by <strong>role, never by name</strong>, in
          anything your manager or sponsor sees. You can edit or remove anything
          you said for 7 days after each session.
        </p>
      </div>
    </main>
  );
}
```

> NOTE: `/me/sessions/[id]/edit` still reads mock data (the edit window is out of scope for this slice). The link is kept so the page renders; clicking it is not part of this slice's acceptance. Leave it.

- [ ] **Step 5: Typecheck + lint + unit tests (ConversationView test must stay green)**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: clean; `components/session/ConversationView.test.tsx` passes unchanged.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add app/(app)/session/actions.ts components/session/ConversationView.tsx app/(app)/session/[id]/page.tsx app/(app)/me/page.tsx
git commit -m "feat(me): real /me dashboard + session.get + complete on session done"
```

- [ ] **Step 8: Browser-verify the full IC loop**

First reseed the dev DB so Northwind has real sessions (Task 12 changes the seed, but for now run the *current* seed to ensure tenants/users exist — if Task 12 is done first, even better):

Run: `npm run db:seed:dashboard`
(If it errors that Northwind is missing, run `npm run db:seed` first, then `npm run db:seed:dashboard`.)

Then verify with the preview tools:
1. `preview_start` (or `preview_list` to reuse a running server).
2. Sign in as the manager (Dev sign-in → `marcus@northwind.example`). Navigate to `/sprint` — if a sprint already exists you'll be redirected to it (expected). To exercise the **launch form**, this is best verified in a tenant with no active sprint; if Northwind already has one, verify the form path by reading it back in Task 12's fresh-tenant check, or temporarily sign in as a manager of a tenant without a sprint. Capture a `preview_screenshot` of `/me` for an IC.
3. Sign in as an IC (`priya@northwind.example`). Open `/me` → confirm real sessions render (3 completed + 1 up-next, per seed). `preview_screenshot`.
4. Click "Start session" → type a reply → send through the script to the done state. Confirm the "Session captured" banner. Return to `/me` and confirm the previously-"up next" session now shows under Completed (the `completeSession` action fired). `preview_screenshot`.
5. `preview_console_logs` + `preview_logs` — confirm no errors (especially no server-action/RLS errors).

If anything fails, diagnose via source (don't patch the test), fix, re-run step 5's gate, then re-verify.

---

## Task 8: Rewire the final report

**Files:**
- Modify: `app/(app)/sprint/[id]/report/page.tsx`

- [ ] **Step 1: Swap the data source** — edit `app/(app)/sprint/[id]/report/page.tsx`

Change the imports:

```tsx
import { usdShort } from "@/lib/data";
import { getApi } from "@/server/trpc/caller";
import { notFound } from "next/navigation";
```

Add `export const dynamic = "force-dynamic";` below the metadata line.

Replace the data-fetch block at the top of `FinalReport`:

```tsx
  const { id } = await params;
  const api = await getApi();
  const sprint = await api.sprint.get({ id }).catch(() => null);
  if (!sprint) notFound();
  const [p, opps] = await Promise.all([
    api.sprint.progress({ id }),
    api.opportunity.listForSprint({ sprintId: id }),
  ]);
```

Everything below (topFive/totalLow/totalHigh/quickWins/highImpact and JSX) is unchanged — it already reads from `sprint`, `p`, `opps`, and `usdShort`.

> The executive-summary paragraph contains a hard-coded sentence about "a manual credit-hold release that stalls roughly 140 orders a month". That copy matches the seeded Northwind opportunity, so it stays accurate for the demo tenant. Leave it.

- [ ] **Step 2: Typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/sprint/[id]/report/page.tsx"
git commit -m "feat(report): final report reads real sprint/progress/opportunities"
```

- [ ] **Step 4: Browser-verify**

1. As the manager, open `/sprint/<northwind-sprint-id>/report` (link from the dashboard "Preview report" button).
2. `preview_snapshot` — confirm the cover (tenant name, sprint name, sponsor), the stat strip (participation %, opportunities count, est. impact), the ranked opportunity cards, and the roadmap columns all render from real data.
3. `preview_console_logs` — no errors. `preview_screenshot`.

---

## Task 9: `withTwistagContext` helper

**Files:**
- Modify: `db/client.ts`
- Create: `db/twistag-context.integration.test.ts`

- [ ] **Step 1: Write the failing integration test** — `db/twistag-context.integration.test.ts`

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { sprints } from "./schema";
import { withTwistagContext } from "./client";
import {
  asUser,
  seedRow,
  resetDb,
  seedTenants,
  TENANT_A,
  TENANT_B,
} from "./test/helpers";

const SPRINT_A = "77777777-7777-4777-8777-77777777a001";
const SPRINT_B = "77777777-7777-4777-8777-77777777b001";

function row(id: string, tenantId: string) {
  return {
    id, tenantId, name: "S", primaryFocus: "ops",
    startDate: "2026-05-18", endDate: "2026-06-12",
    cadence: "weekly", status: "active",
  };
}

beforeEach(async () => {
  await resetDb();
  await seedTenants();
  await seedRow((tx) => tx.insert(sprints).values(row(SPRINT_A, TENANT_A)));
  await seedRow((tx) => tx.insert(sprints).values(row(SPRINT_B, TENANT_B)));
});

describe("withTwistagContext", () => {
  it("reads sprints across all tenants", async () => {
    const rows = await withTwistagContext(
      { twistagRole: "twistag_admin", actor: "00000000-0000-4000-8000-0000000000ff" },
      (tx) => tx.select().from(sprints),
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it("a tenant context still reads only its own (control)", async () => {
    const rows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(sprints),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(SPRINT_A);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:integration -- db/twistag-context.integration.test.ts`
Expected: FAIL — `withTwistagContext` is not exported.

- [ ] **Step 3: Implement the helper** — add to `db/client.ts` (after `withServiceRole`)

```ts
/**
 * Run `fn` with a Twistag (cross-tenant) read context: the `*_twistag_read`
 * RLS policies (USING twistag_role IS NOT NULL) grant SELECT across all
 * tenants. The read runs as the `authenticated` role with a twistag_role
 * claim — NOT a service-role bypass. The access is audit-logged (written as
 * service_role first, in the same transaction).
 *
 * Read-only by intent: tenant insert/update policies require a tenant_id match,
 * which a twistag claim does not have, so writes here would be denied anyway.
 */
export async function withTwistagContext<T>(
  audit: { twistagRole: string; actor: string },
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  const claimsJson = JSON.stringify({
    sub: audit.actor,
    twistag_role: audit.twistagRole,
  });
  return db().transaction(async (tx) => {
    // Audit the cross-tenant read as service_role (authenticated lacks INSERT
    // on audit_log).
    await tx.execute(sql`SET LOCAL ROLE service_role`);
    await tx.execute(
      sql`INSERT INTO public.audit_log (action, metadata)
          VALUES ('twistag.read',
                  jsonb_build_object('actor', ${audit.actor}::text,
                                     'twistag_role', ${audit.twistagRole}::text))`,
    );
    // Switch to authenticated + twistag claims for the actual reads.
    await tx.execute(sql`SET LOCAL ROLE authenticated`);
    await tx.execute(
      sql`SELECT set_config('request.jwt.claims', ${claimsJson}, true)`,
    );
    return fn(tx as unknown as Db);
  });
}
```

> Two `SET LOCAL ROLE` calls in one transaction are valid: `SET ROLE` is checked against the session (login) role, which can become both `service_role` and `authenticated`. `SET LOCAL` resets at commit/rollback.

- [ ] **Step 4: Run integration test to verify it passes**

Run: `npm run test:integration -- db/twistag-context.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add db/client.ts db/twistag-context.integration.test.ts
git commit -m "feat(db): withTwistagContext — audited cross-tenant RLS reads"
```

---

## Task 10: `twistag.clientList`

**Files:**
- Create: `server/trpc/routers/twistag.ts`
- Modify: `server/trpc/routers/_app.ts`
- Modify: `server/trpc/router.integration.test.ts`

- [ ] **Step 1: Write the failing integration test** — add a `describe` to `server/trpc/router.integration.test.ts`

```ts
describe("twistag.clientList", () => {
  it("aggregates clients across tenants for a twistag session", async () => {
    // SPRINT_A (TENANT_A) + SPRINT_B (TENANT_B) + their opportunities exist
    // from the outer beforeEach.
    const api = createCaller({
      session: { kind: "twistag", twistagRole: "twistag_admin", userId: "00000000-0000-4000-8000-0000000000ff" },
    });
    const clients = await api.twistag.clientList();
    expect(clients.length).toBeGreaterThanOrEqual(2);
    const names = clients.map((c) => c.name).sort();
    expect(names).toContain("Tenant A");
    expect(names).toContain("Tenant B");
    const a = clients.find((c) => c.name === "Tenant A")!;
    expect(a.opportunities).toBeGreaterThanOrEqual(1);
    expect(["healthy", "watch", "at_risk"]).toContain(a.health);
  });

  it("rejects a tenant session (twistagProcedure)", async () => {
    const api = asTenant(TENANT_A);
    await expect(api.twistag.clientList()).rejects.toThrow();
  });
});
```

> `asTenant` already exists in this file (the original isolation suite). `TENANT_A`/`TENANT_B` sprints + one opportunity each are seeded by the outer `beforeEach`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:integration -- server/trpc/router.integration.test.ts`
Expected: FAIL — `api.twistag` is undefined.

- [ ] **Step 3: Create the router** — `server/trpc/routers/twistag.ts`

```ts
import { router, twistagProcedure } from "../trpc";
import { withTwistagContext } from "@/db/client";
import {
  tenants,
  sprints,
  sprintParticipants,
  opportunities,
} from "@/db/schema";
import type { ClientSummary } from "@/lib/types";

export const twistagRouter = router({
  clientList: twistagProcedure.query(({ ctx }) =>
    withTwistagContext(
      { twistagRole: ctx.session.twistagRole, actor: ctx.session.userId },
      async (tx): Promise<ClientSummary[]> => {
        const [tenantRows, sprintRows, partRows, oppRows] = await Promise.all([
          tx.select().from(tenants),
          tx.select().from(sprints),
          tx.select().from(sprintParticipants),
          tx
            .select({
              sprintId: opportunities.sprintId,
              status: opportunities.status,
            })
            .from(opportunities),
        ]);

        return tenantRows.map((t): ClientSummary => {
          // Most recent active sprint for this tenant.
          const tenantSprints = sprintRows
            .filter((s) => s.tenantId === t.id && s.status === "active")
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
            );
          const sprint = tenantSprints[0];

          const parts = sprint
            ? partRows.filter((p) => p.sprintId === sprint.id)
            : [];
          const done = parts.reduce((s, p) => s + p.sessionsCompleted, 0);
          const total = parts.reduce((s, p) => s + p.sessionsTotal, 0);
          const completionPct = total ? Math.round((done / total) * 100) : 0;

          const opps = sprint
            ? oppRows.filter((o) => o.sprintId === sprint.id)
            : [];
          const approved = opps.filter((o) => o.status === "approved").length;

          const health: ClientSummary["health"] = !sprint
            ? "at_risk"
            : completionPct >= 60
              ? "healthy"
              : completionPct >= 30
                ? "watch"
                : "at_risk";

          const alert =
            !sprint
              ? "No sprint launched yet"
              : health === "healthy"
                ? undefined
                : `Participation at ${completionPct}% — ${done}/${total} sessions complete`;

          return {
            tenantId: t.id,
            name: t.name,
            segment: t.segment,
            sprintName: sprint?.name ?? "No active sprint",
            health,
            completionPct,
            opportunities: opps.length,
            approved,
            engagementLead: "You",
            alert,
          };
        });
      },
    ),
  ),
});
```

- [ ] **Step 4: Mount it** — edit `server/trpc/routers/_app.ts`

```ts
import { router } from "../trpc";
import { sprintRouter } from "./sprint";
import { opportunityRouter } from "./opportunity";
import { sessionRouter } from "./session";
import { twistagRouter } from "./twistag";

export const appRouter = router({
  sprint: sprintRouter,
  opportunity: opportunityRouter,
  session: sessionRouter,
  twistag: twistagRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 5: Run integration test to verify it passes**

Run: `npm run test:integration -- server/trpc/router.integration.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add server/trpc/routers/twistag.ts server/trpc/routers/_app.ts server/trpc/router.integration.test.ts
git commit -m "feat(trpc): twistag.clientList — real cross-tenant client health"
```

---

## Task 11: Rewire the Twistag cockpit

**Files:**
- Modify: `app/(app)/twistag/page.tsx`

- [ ] **Step 1: Swap the data source + drop the demo-only link special-casing** — edit `app/(app)/twistag/page.tsx`

Change the imports — remove `import { db } from "@/lib/data";` and add:

```tsx
import { getApi } from "@/server/trpc/caller";
```

Add below the metadata line:

```tsx
export const dynamic = "force-dynamic";
```

Replace the first data line in `TwistagCockpit`:

```tsx
  const api = await getApi();
  const clients = await api.twistag.clientList();
```

In the **alerts** block, replace the conditional Northwind `Link`/span with a plain label (Twistag has no read-through into a tenant's own dashboard in this slice):

```tsx
                <span className="shrink-0 text-[13px] font-medium text-text-3">
                  Needs attention
                </span>
```

In the **client table**, replace the `isLive` name cell with a plain name (delete the `const isLive = ...` line and the `Link`):

```tsx
                <Td>
                  <div className="font-medium leading-tight">{c.name}</div>
                  <div className="text-xs text-text-3">{c.segment}</div>
                </Td>
```

Replace the closing caveat paragraph with honest copy:

```tsx
      <p className="mt-3 px-1 text-xs text-text-3">
        Live across every client you lead. Health and completion update as
        participants finish their sessions.
      </p>
```

> `clientHealthMeta` import stays (used for the health badge). Remove the now-unused `Link` import from `next/link` if it is no longer referenced anywhere in the file (check the alerts block — after the change above, `Link` is gone; delete the import to satisfy lint).

- [ ] **Step 2: Typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: clean (lint will flag an unused `Link` import if you missed it — remove it).

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/twistag/page.tsx"
git commit -m "feat(twistag): cockpit reads real multi-tenant client health"
```

- [ ] **Step 4: Browser-verify**

1. Sign in as a Twistag user (Dev sign-in with a `twistag_users` email — check `db/seed-demo.ts`/`db/proof-auth.ts` for the seeded twistag email; e.g. an `@twistag.com` address). Navigate to `/twistag`.
2. `preview_snapshot` — confirm the stat strip (active clients, open opportunities, approved, avg completion), the client table rows (Northwind at minimum), and health badges render from real data.
3. `preview_console_logs` + `preview_logs` — confirm no errors and (optionally) that an `audit_log` `twistag.read` row was written (the helper logs each call). `preview_screenshot`.

---

## Task 12: Seed real sessions for Northwind + full gate + merge

**Files:**
- Modify: `db/seed-dashboard.ts`

- [ ] **Step 1: Add sessions to the seed** — edit `db/seed-dashboard.ts`

Add `sessions` to the schema import:

```ts
import {
  tenants,
  users,
  sprints,
  topics,
  sprintParticipants,
  sessions,
  opportunities,
  captures,
  opportunityEvidence,
} from "./schema";
```

In the idempotent-clear block, delete sessions before topics (sessions reference topics + users + sprint). Add this line right after the `opportunities` delete and before the `sprintParticipants` delete:

```ts
      await tx.delete(sessions).where(eq(sessions.tenantId, tenantId));
```

After the participants insert loop (after the `for (const p of sprint.participants) { ... }` block, before the opportunities loop), add a sessions-seeding block:

```ts
      // Sessions: one per participant × topic. The first `sessionsCompleted`
      // topics (in order) are marked complete so the IC's /me is real.
      const dbTopics = await tx
        .select()
        .from(topics)
        .where(eq(topics.tenantId, tenantId))
        .orderBy(topics.orderIdx);
      for (const p of sprint.participants) {
        const uid = byEmail.get(p.user.email)?.id;
        if (!uid) continue;
        for (let i = 0; i < dbTopics.length; i++) {
          const done = i < p.sessionsCompleted;
          await tx.insert(sessions).values({
            tenantId,
            sprintId: SPRINT_ID,
            topicId: dbTopics[i].id,
            userId: uid,
            status: done ? "completed" : "not_started",
            totalSeconds: done ? 360 : null,
            messagesCount: done ? 11 : 0,
            captureCount: done ? 5 : 0,
            completedAt: done ? new Date("2026-05-25T12:00:00Z") : null,
            editWindowEndsAt: done ? new Date("2026-06-01T12:00:00Z") : null,
          });
        }
      }
```

> No `onConflictDoNothing` needed — `sessions` has no natural unique key, and the leading `delete` makes the seed idempotent. `orderBy` is already importable via the existing drizzle usage; if `topics.orderIdx` ordering needs the `asc` helper it is the default, so `.orderBy(topics.orderIdx)` is fine.

- [ ] **Step 2: Run the seed against the dev DB**

Run: `npm run db:seed:dashboard`
Expected: prints "dashboard seed complete — sprint 5f1b2c00-… , 7 opportunities" and exits 0.

> If it errors that Northwind is missing, run `npm run db:seed` first, then `npm run db:seed:dashboard`.

- [ ] **Step 3: Full gate**

Run: `npm run typecheck && npm run lint && npm run test && npm run test:integration && npm run build`
Expected: all green. Confirm counts: existing 28 unit + new unit tests pass; existing 32 integration + new (launch, myDashboard/get, sessions core, twistag-context, twistag.clientList) pass.

- [ ] **Step 4: Commit**

```bash
git add db/seed-dashboard.ts
git commit -m "feat(seed): seed real sessions for Northwind participants"
```

- [ ] **Step 5: Final browser pass (regression of the whole loop)**

With the seed re-run, re-verify the three personas quickly via preview tools:
- IC (`priya@northwind.example`) → `/me` shows 3 completed + 1 up-next; complete the last one; it moves to Completed.
- Manager (`marcus@northwind.example`) → `/sprint/<id>` dashboard + `/sprint/<id>/report` render real data; participant progress reflects the IC's completion (reseeded baseline).
- Twistag user → `/twistag` shows Northwind with real completion/opportunity counts.

Capture a `preview_screenshot` of each. Confirm `preview_console_logs` clean on each.

- [ ] **Step 6: Merge to main**

From the **main checkout** (`/Users/fred/Documents/GitHub/atlas-project`):

```bash
git -C /Users/fred/Documents/GitHub/atlas-project checkout main
git -C /Users/fred/Documents/GitHub/atlas-project merge --no-ff backend-lifecycle -m "Merge backend-lifecycle: sprint launch + lifecycle, /me & report & Twistag cockpit on real data"
```

Then push if the user asks. Per CLAUDE.md, RLS-policy changes need 2 approvals — **this slice adds no new RLS policies** (it reuses existing tenant + `*_twistag_read` policies), so no extra approval gate. After merge, offer to remove the worktree:

```bash
git -C /Users/fred/Documents/GitHub/atlas-project worktree remove /Users/fred/Documents/GitHub/atlas-lifecycle
```

- [ ] **Step 7: Update status**

- Update `roadmap/sprints.md` ticket status if a matching ticket exists.
- Update the memory file `in-flight-sprint-lifecycle.md` → mark implemented + merged (or replace with a `trpc-real-data`-style "done" memory).

---

## Self-Review (completed by plan author)

**Spec coverage:**
- §2 Phase A (launch form + sprint.launch + topic templates + LaunchSprintSchema) → Tasks 1, 2, 3, 4. ✓
- §3 Phase B (session.myDashboard, /me rewire, completeSession, session.get) → Tasks 5, 6, 7. ✓
- §4 Phase C (report on real data) → Task 8. ✓
- §5 Phase D (withTwistagContext, twistagProcedure, twistag.clientList, cockpit rewire) → Tasks 2, 9, 10, 11. ✓
- §6 Seed sessions → Task 12. ✓
- §7 tRPC surface (sprint.launch, session.myDashboard/get, twistag.clientList, completeSession action) → Tasks 3, 5, 7, 10. ✓
- §8 Testing (launch isolation, complete + cross-user, withTwistagContext cross-tenant + control, twistagProcedure reject, schema/template units) → Tasks 1, 3, 6, 9, 10. ✓

**Type consistency:** `MyDashboard`/`MySessionView` defined in Task 5 and consumed in Task 7; `LaunchSprintSchema`/`LaunchSprintInput` defined Task 1, used Tasks 3 & 4; `TenantClaims` (existing) used in Task 6; `ClientSummary` (existing) returned in Task 10 and rendered in Task 11; `completeSessionForUser` signature identical in Tasks 6 & 7. ✓

**Decisions deliberately made (flagged):**
- `withTwistagContext` audits via a `service_role` INSERT inside the same transaction (authenticated lacks `audit_log` INSERT) — avoids a new RLS migration and the 2-approval rule.
- The Twistag cockpit drops per-tenant deep-links (Twistag cannot read a tenant's own dashboard via `tenantProcedure` in this slice) — names render as plain text. Twistag impersonation is out of scope per spec §11.
- `sprint.launch` sets `sponsorId` to the selected participant whose role is `sponsor` (if any) and `managerId` to the launching user; `scope_department` is derived from selected members' departments.
