# tRPC + real tenant data (core screens) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** Make the manager dashboard and opportunity detail render real, tenant-scoped data via tRPC (server caller), backed by new dashboard tables seeded with Northwind's content.

**Architecture:** New migration `0002` adds the dashboard tables (RLS per ADR-001). tRPC server with a `tenantProcedure` whose context is the Supabase session; routers run inside `withTenantContext(session)` so RLS scopes every read. Server components call a per-request tRPC **server caller** (no HTTP for SSR reads). Routers return the existing `lib/types.ts` view shapes, so pages barely change.

**Tech Stack:** @trpc/server 11.17, @trpc/client 11.17, @tanstack/react-query 5.101, superjson 2.2.6, zod 4, drizzle, embedded-postgres tests.

**Branch/worktree:** `backend-trpc` at `/Users/fred/Documents/GitHub/atlas-trpc` (created, `.env.local` copied). Spec: `docs/superpowers/specs/2026-06-09-trpc-real-data-design.md`.

**Conventions:** strict TS, explicit return types on exports, co-located tests, `@/` alias, every procedure has a Zod input. Each task ends green.

---

## File map

**New:** `db/migrations/0002_dashboard_tables.sql`; `db/seed-dashboard.ts`;
`db/opportunities.integration.test.ts`, `db/sessions.integration.test.ts`,
`db/captures.integration.test.ts`; `server/trpc/{trpc,context,caller}.ts`,
`server/trpc/routers/{sprint,opportunity,_app}.ts`; `server/trpc/router.integration.test.ts`;
`app/api/trpc/[trpc]/route.ts`; `lib/trpc/react.tsx`; `lib/dashboard-map.ts` (+ `.test.ts`);
`app/(app)/sprint/page.tsx`.

**Modified:** `db/schema.ts`; `package.json`; `app/(app)/sprint/[id]/page.tsx`;
`app/(app)/sprint/[id]/opportunity/[oppId]/page.tsx`; `components/AppSidebar.tsx`;
`.env.example`; `README.md`.

---

### Task 1: tRPC dependencies

- [ ] **Step 1:** `npm install @trpc/server@^11.17.0 @trpc/client@^11.17.0 @trpc/react-query@^11.17.0 @tanstack/react-query@^5.101.0 superjson@^2.2.6`
- [ ] **Step 2:** `npm run typecheck` → passes.
- [ ] **Step 3:** Commit: `git add package.json package-lock.json && git commit -m "chore: add tRPC + react-query + superjson"`

---

### Task 2: Dashboard tables (schema + migration)

**Files:** Modify `db/schema.ts`; Create `db/migrations/0002_dashboard_tables.sql`

- [ ] **Step 1:** Add to `db/schema.ts` (after `sprints`):

```ts
import { integer, numeric, doublePrecision, primaryKey } from "drizzle-orm/pg-core";

export const topics = pgTable("topics", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  sprintId: uuid("sprint_id").notNull().references(() => sprints.id),
  title: text("title").notNull(),
  description: text("description"),
  orderIdx: integer("order_idx").notNull(),
  questionCount: integer("question_count").notNull(),
  estMinutes: integer("est_minutes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sprintParticipants = pgTable("sprint_participants", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  sprintId: uuid("sprint_id").notNull().references(() => sprints.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  status: text("status").notNull(),
  sessionsCompleted: integer("sessions_completed").notNull().default(0),
  sessionsTotal: integer("sessions_total").notNull().default(4),
  lastActiveLabel: text("last_active_label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ pk: primaryKey({ columns: [t.sprintId, t.userId] }) }));

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  sprintId: uuid("sprint_id").notNull().references(() => sprints.id),
  topicId: uuid("topic_id").references(() => topics.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  status: text("status").notNull(),
  totalSeconds: integer("total_seconds"),
  messagesCount: integer("messages_count").notNull().default(0),
  captureCount: integer("capture_count").notNull().default(0),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  editWindowEndsAt: timestamp("edit_window_ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const captures = pgTable("captures", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  sessionId: uuid("session_id").references(() => sessions.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  kind: text("kind").notNull(),
  summary: text("summary").notNull(),
  sourceQuote: text("source_quote").notNull(),
  tags: text("tags").array().notNull().default([]),
  isEdited: boolean("is_edited").notNull().default(false),
  isRemoved: boolean("is_removed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const opportunities = pgTable("opportunities", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  sprintId: uuid("sprint_id").notNull().references(() => sprints.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  departments: text("departments").array().notNull().default([]),
  impactLow: integer("impact_low").notNull(),
  impactHigh: integer("impact_high").notNull(),
  timeToShipWeeksLow: integer("time_to_ship_weeks_low").notNull(),
  timeToShipWeeksHigh: integer("time_to_ship_weeks_high").notNull(),
  confidenceScore: integer("confidence_score").notNull(),
  compositeScore: numeric("composite_score", { precision: 3, scale: 1 }).notNull(),
  dimensionScores: jsonb("dimension_scores").notNull(),
  rationale: text("rationale").notNull(),
  status: text("status").notNull(),
  contributorCount: integer("contributor_count").notNull().default(0),
  patternMatch: jsonb("pattern_match"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const opportunityEvidence = pgTable("opportunity_evidence", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id),
  captureId: uuid("capture_id").notNull().references(() => captures.id),
  weight: doublePrecision("weight").notNull().default(1),
}, (t) => ({ pk: primaryKey({ columns: [t.opportunityId, t.captureId] }) }));
```

- [ ] **Step 2:** Create `db/migrations/0002_dashboard_tables.sql` — the 6 tables (columns matching the Drizzle defs above), then for each: `tenant_id` index, `GRANT SELECT,INSERT,UPDATE,DELETE ... TO authenticated`, `ENABLE ROW LEVEL SECURITY`, the standard 4 tenant policies (`USING/ WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)`) + `*_twistag_read` (`USING ((auth.jwt() ->> 'twistag_role') IS NOT NULL)`). Include `GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`. (Full SQL written at execution — mirror `0001`'s structure exactly for all 6 tables.)

- [ ] **Step 3:** `npm run typecheck` → passes. Integration globalSetup will apply `0002` on next run.
- [ ] **Step 4:** Commit: `git add db/schema.ts db/migrations/0002_dashboard_tables.sql && git commit -m "feat(db): dashboard tables (topics, participants, sessions, captures, opportunities, evidence) + RLS"`

---

### Task 3: Adversarial isolation tests for new tables

**Files:** Create `db/opportunities.integration.test.ts`, `db/sessions.integration.test.ts`, `db/captures.integration.test.ts`

- [ ] **Step 1:** Write `db/opportunities.integration.test.ts` mirroring `db/sprints.integration.test.ts`: `beforeEach` resets + seedTenants + seeds a Northwind-style sprint row (service role) for TENANT_A, then an opportunity for it; tests: tenant A reads it (positive), tenant B reads 0, tenant B insert tagged A throws, tenant B update/delete affects 0. (Needs a sprint row first — insert via `seedRow` into `sprints` with required fields.)

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { sprints, opportunities } from "./schema";
import { asUser, seedRow, resetDb, seedTenants, TENANT_A, TENANT_B } from "./test/helpers";

const SPRINT = { id: "11111111-1111-1111-1111-1111111111a1", tenantId: TENANT_A, name: "S", primaryFocus: "ops", startDate: "2026-05-18", endDate: "2026-06-12", cadence: "weekly", status: "active" };
const OPP = { tenantId: TENANT_A, sprintId: SPRINT.id, title: "Secret Opp", description: "x", category: "c", impactLow: 1, impactHigh: 2, timeToShipWeeksLow: 1, timeToShipWeeksHigh: 2, confidenceScore: 5, compositeScore: "8.7", dimensionScores: [], rationale: "r", status: "surfaced" };

beforeEach(async () => {
  await resetDb();
  await seedTenants();
  await seedRow((tx) => tx.insert(sprints).values(SPRINT));
  await seedRow((tx) => tx.insert(opportunities).values(OPP));
});

describe("opportunities — tenant isolation", () => {
  it("tenant A reads its opportunity", async () => {
    const rows = await asUser({ tenantId: TENANT_A }, (tx) => tx.select().from(opportunities));
    expect(rows).toHaveLength(1);
  });
  it("tenant B reads none", async () => {
    const rows = await asUser({ tenantId: TENANT_B }, (tx) => tx.select().from(opportunities));
    expect(rows).toHaveLength(0);
  });
  it("tenant B cannot insert tagged A", async () => {
    await expect(asUser({ tenantId: TENANT_B }, (tx) => tx.insert(opportunities).values({ ...OPP, title: "Evil" }))).rejects.toThrow();
  });
});
```

- [ ] **Step 2:** Write `db/sessions.integration.test.ts` and `db/captures.integration.test.ts` following the same shape (sessions need a `userId` — seed a user; captures need a `sessionId`/`userId`). Update `db/test/helpers.ts` `resetDb()` to also TRUNCATE the new tables (add `opportunity_evidence, captures, sessions, sprint_participants, topics, opportunities` to the TRUNCATE list, before `sprints, users, tenants`, CASCADE).

- [ ] **Step 3:** Run `npm run test:integration` → all pass (existing 17 + new).
- [ ] **Step 4:** Commit: `git add db/*.integration.test.ts db/test/helpers.ts && git commit -m "test(db): adversarial isolation for opportunities/sessions/captures"`

---

### Task 4: Seed Northwind's dashboard content + apply to Supabase

**Files:** Create `db/seed-dashboard.ts`; Modify `package.json`

- [ ] **Step 1:** Write `db/seed-dashboard.ts` (idempotent, service role). Look up the Northwind tenant (`slug='northwind'`) + its users (manager Marcus, ICs Priya/Tom + invited ones). Insert one sprint (FIXED id `5f1b2c00-0000-4000-8000-000000000001`) with `metadata: { signalQuality: 4.6 }`, 4 topics, sprint_participants for each user, a few sessions, 7 opportunities (port the `dimensionScores`/`rationale`/impact from `lib/data.ts`), captures, and opportunity_evidence linking them. Use `onConflictDoNothing`. Mirror the content already in `lib/data.ts` so the demo becomes real.
- [ ] **Step 2:** Add script: `"db:seed:dashboard": "tsx --env-file=.env.local db/seed-dashboard.ts"`.
- [ ] **Step 3:** Apply to Supabase: `npm run db:migrate` (applies 0002) then `npm run db:seed:dashboard`. Expect: `applied 0002…`, seed prints rows created.
- [ ] **Step 4:** Commit: `git add db/seed-dashboard.ts package.json package-lock.json && git commit -m "feat(db): seed Northwind dashboard content into real tables"`

---

### Task 5: tRPC server + context

**Files:** Create `server/trpc/trpc.ts`, `server/trpc/context.ts`

- [ ] **Step 1:** `server/trpc/context.ts`:

```ts
import { getSession } from "@/lib/session";
import type { Claims } from "@/lib/auth-claims";

export async function createContext(): Promise<{ session: Claims }> {
  return { session: await getSession() };
}
export type Context = Awaited<ReturnType<typeof createContext>>;
```

- [ ] **Step 2:** `server/trpc/trpc.ts`:

```ts
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

/** Requires a tenant session; narrows ctx.session to the tenant kind. */
export const tenantProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session || ctx.session.kind !== "tenant") {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { session: ctx.session } });
});
```

- [ ] **Step 3:** `npm run typecheck` → passes. Commit: `git add server/trpc/trpc.ts server/trpc/context.ts && git commit -m "feat(trpc): server init + tenant context"`

---

### Task 6: Mapping helpers + routers + caller

**Files:** Create `lib/dashboard-map.ts` (+ `.test.ts`), `server/trpc/routers/{sprint,opportunity,_app}.ts`, `server/trpc/caller.ts`

- [ ] **Step 1:** `lib/dashboard-map.ts` — pure functions over DB rows → view types: `computeProgress(sessions, participants, opportunities, signalQuality)` → `SprintProgress`; `toOpportunity(row, evidence)` → `Opportunity` (coerce `compositeScore` string→number, type `dimensionScores`). Unit-test `computeProgress` in `lib/dashboard-map.test.ts` (completion %, high-impact count).
- [ ] **Step 2:** `server/trpc/routers/sprint.ts` — `tenantProcedure` queries inside `withTenantContext(ctx.session, …)`:
  - `currentForTenant()` → the tenant's most recent sprint id (or null).
  - `get({ id })` (Zod `{ id: z.string().uuid() }`) → assemble `Sprint` (sprint row + topics + participants joined to users for name/dept). `NOT_FOUND` if no row.
  - `progress({ id })` → `computeProgress(...)`.
  - `participants({ id })` and `activity({ id })` (derive activity from recent sessions/opportunities).
- [ ] **Step 3:** `server/trpc/routers/opportunity.ts` — `listForSprint({ sprintId })` → `Opportunity[]` sorted by composite; `get({ id })` → `Opportunity` with evidence (join `opportunity_evidence`→`captures`→`users` for role).
- [ ] **Step 4:** `server/trpc/routers/_app.ts` — `export const appRouter = router({ sprint, opportunity })`; `export type AppRouter = typeof appRouter`.
- [ ] **Step 5:** `server/trpc/caller.ts`:

```ts
import { createCallerFactory } from "./trpc";
import { appRouter } from "./routers/_app";
import { createContext } from "./context";

const createCaller = createCallerFactory(appRouter);
/** Per-request server caller for Server Components. */
export async function getApi() {
  return createCaller(await createContext());
}
```

- [ ] **Step 6:** `npm run typecheck && npm test -- lib/dashboard-map.test.ts` → pass. Commit.

---

### Task 7: HTTP route + client provider scaffold

**Files:** Create `app/api/trpc/[trpc]/route.ts`, `lib/trpc/react.tsx`

- [ ] **Step 1:** `app/api/trpc/[trpc]/route.ts` — `fetchRequestHandler` wiring `appRouter` + `createContext`, exported as `GET`/`POST`.
- [ ] **Step 2:** `lib/trpc/react.tsx` — `createTRPCReact<AppRouter>()` + a `TRPCProvider` (QueryClient + httpBatchLink with superjson). Not wired into the tree this slice (server caller drives reads); it's the scaffold for future client components.
- [ ] **Step 3:** `npm run build` → passes. Commit.

---

### Task 8: `/sprint` index redirect + sidebar link

**Files:** Create `app/(app)/sprint/page.tsx`; Modify `components/AppSidebar.tsx`

- [ ] **Step 1:** `app/(app)/sprint/page.tsx`: `const api = await getApi(); const id = await api.sprint.currentForTenant();` → `redirect('/sprint/'+id)` if present, else render an empty state ("No active sprint yet").
- [ ] **Step 2:** In `components/AppSidebar.tsx`, change the manager/dashboard href from the hardcoded `/sprint/spr-northwind-q2` to `/sprint`. (One-line; if the sidebar was restructured upstream, find the manager link and repoint it.)
- [ ] **Step 3:** `npm run build` → passes. Commit.

---

### Task 9: Rewire manager dashboard

**Files:** Modify `app/(app)/sprint/[id]/page.tsx`

- [ ] **Step 1:** Replace the `db.sprint.*` / `db.opportunity.listForSprint` reads with `const api = await getApi();` then `api.sprint.get({id})`, `api.sprint.progress({id})`, `api.sprint.activity({id})`, `api.opportunity.listForSprint({sprintId:id})`. Keep all rendering. `notFound()` if `sprint.get` throws NOT_FOUND (wrap in try/catch or have the router return null + check).
- [ ] **Step 2:** `npm run build` + manual: sign in as Marcus (Northwind), visit `/sprint` → real dashboard. Commit.

---

### Task 10: Rewire opportunity detail

**Files:** Modify `app/(app)/sprint/[id]/opportunity/[oppId]/page.tsx`

- [ ] **Step 1:** Replace `db.opportunity.get(oppId)` with `const api = await getApi(); const opp = await api.opportunity.get({ id: oppId });`. `sowDraftFor(opp)` stays.
- [ ] **Step 2:** `npm run build` + manual: open an opportunity from the dashboard → real evidence + scores. Commit.

---

### Task 11: Router isolation test + full gate

**Files:** Create `server/trpc/router.integration.test.ts`

- [ ] **Step 1:** Integration test: seed two tenants each with a sprint+opportunity (service role); build a caller with a stubbed context `{ session: { kind:'tenant', tenantId: TENANT_A, userId, role:'manager' } }`; assert `opportunity.listForSprint({sprintId: tenantB_sprint})` returns `[]` (RLS blocks) and `sprint.get({id: tenantB_sprint})` throws NOT_FOUND. Construct the caller via `createCallerFactory(appRouter)({ session })`.
- [ ] **Step 2:** Full gate: `npm run format:check && npm run typecheck && npm run lint && npm test && npm run test:integration && npm run build` → all green.
- [ ] **Step 3:** Commit.

---

### Task 12: Browser verification, docs, merge

- [ ] **Step 1:** `PORT=3006 npm run dev`; drive: sign in as Marcus → `/sprint` → dashboard real → open opportunity → real detail. Sign in as Jordan (Helios) → `/sprint` → empty state (no cross-tenant leak). Screenshot-verify.
- [ ] **Step 2:** Update `.env.example` (note `db:seed:dashboard`), `README.md` (tRPC + real-data note), mark spec `Implemented`.
- [ ] **Step 3:** Commit; from main tree `git merge --no-ff backend-trpc`; `npm install`; full gate on main; push; remove worktree + delete branch.

---

## Self-review notes (author)

- **Spec coverage:** §4 tables→T2; §9 adversarial→T3; §8 seed→T4; §6 tRPC→T5–T7; §5 mapping→T6; §7 rewiring→T8–T10; §9 router test→T11; §11 success→T11–T12.
- **Type consistency:** `getApi()`, `tenantProcedure`, `createContext`/`Context`, `computeProgress`/`toOpportunity`, router methods (`sprint.get/progress/participants/activity/currentForTenant`, `opportunity.listForSprint/get`) used identically across tasks.
- **Risks honored:** per-request caller (T5/T6 `getApi` reads cookies each call); batched assembly inside one `withTenantContext`; outputs typed from `lib/types.ts`.
- **Known nuance:** `compositeScore` is `numeric` → returned as string by postgres-js; `toOpportunity` coerces to number (T6). Flagged, not a placeholder.
