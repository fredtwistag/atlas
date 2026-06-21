# Workflow Maps — Foundation & Engine Implementation Plan (Plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the persisted, evidence-grounded engine that synthesizes workflow-diagram graphs from captures (route → generate → validate → critic → confidence → gate), wired into `recompute.ts`. No UI.

**Architecture:** A new `workflow_maps` table (tenant-scoped, RLS, JSONB graph). A `services/synthesis/workflows/` module split into focused pure files (stats/routing, validate, confidence, impact-effort) plus LLM files (generate, critique) and an orchestrator (synthesize). The LLM emits *semantic structure only* (lanes/steps/edges citing `captureIds`, role+department, never names or `contributorId`); deterministic TS validates, scores confidence, and gates. Mirrors the existing `clusterSystems` / `buildSystemsInventory` pattern exactly.

**Tech Stack:** TypeScript (strict), Drizzle ORM, Postgres + RLS, Zod, vitest (unit) + embedded-postgres (integration), Anthropic via `@/services/llm/client`.

**Spec:** `docs/superpowers/specs/2026-06-21-workflow-maps-design.md`

**Scope note:** This is Plan 1 of 3. Plan 2 = renderer family + report surfacing. Plan 3 = Twistag curation card + opportunity before/after. This plan produces validated, confidence-scored, persisted `provisional` graphs — fully testable, no rendering.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `db/schema.ts` | `workflowMaps` Drizzle table | Modify |
| `db/migrations/0017_workflow_maps.sql` | Table DDL + RLS policies | Create |
| `db/test/helpers.ts` | add `workflow_maps` to `resetDb` TRUNCATE | Modify |
| `db/workflow-maps.integration.test.ts` | RLS isolation + no-clobber + jsonb roundtrip | Create |
| `services/llm/schemas.ts` | `workflowGraphDraft`, `workflowCritique` Zod + types | Modify |
| `services/synthesis/workflows/types.ts` | `WorkflowCapture`, `OpportunityPoint`, `WorkflowGraph`, `WorkflowConfidence` | Create |
| `services/synthesis/workflows/stats.ts` (+test) | `captureStats`, `routeKinds` (pure) | Create |
| `services/synthesis/workflows/validate.ts` (+test) | `validateGraph` (pure) | Create |
| `services/synthesis/workflows/confidence.ts` (+test) | `scoreConfidence` (pure) | Create |
| `services/synthesis/workflows/impact-effort.ts` (+test) | `buildImpactEffort` (pure, no LLM) | Create |
| `services/synthesis/workflows/generate.ts` (+test) | `generateGraph`, `KIND_PROMPTS`, `critiqueGraph` (LLM) | Create |
| `services/synthesis/workflows/synthesize.ts` (+test) | `synthesizeWorkflows` orchestrator | Create |
| `services/opportunity/recompute.ts` | `buildWorkflowMaps` + call site | Modify |

> No `index.ts` barrels (per CLAUDE.md). Direct imports only. Co-locate each `*.test.ts` next to its source.

**Commands** (verify against `package.json` if a script name differs):
- Unit test one file: `npx vitest run <path>`
- Integration test one file: `npx vitest run -c vitest.integration.config.ts <path>`
- Typecheck: `npx tsc --noEmit`

---

## Task 1: `workflow_maps` table + migration

**Files:**
- Modify: `db/schema.ts` (add table near `systemInventoryItems`)
- Create: `db/migrations/0017_workflow_maps.sql`
- Modify: `db/test/helpers.ts` (`resetDb` TRUNCATE list)

- [ ] **Step 1: Confirm the next migration number**

Run: `ls db/migrations/ | sort | tail -3`
Expected: highest existing file is `0016_*.sql`. If it's higher, rename the file below to the next number and keep the rest identical.

- [ ] **Step 2: Add the Drizzle table to `db/schema.ts`**

Add after the `systemInventoryEvidence` table definition:

```typescript
// WORKFLOW MAPS (Plan 1) — synthesized diagram graphs, curated like
// opportunities (provisional → surfaced → hidden). The graph is the full
// WorkflowGraph payload (kind, lanes, steps, edges, confidence, modelVersion).
export const workflowMaps = pgTable("workflow_maps", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  sprintId: uuid("sprint_id")
    .notNull()
    .references(() => sprints.id),
  kind: text("kind").notNull(),
  graph: jsonb("graph").notNull(),
  status: text("status").notNull().default("provisional"),
  // Set only for kind = 'before_after' (Plan 3); null otherwise.
  opportunityId: uuid("opportunity_id").references(() => opportunities.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

- [ ] **Step 3: Write the migration SQL**

Create `db/migrations/0017_workflow_maps.sql`:

```sql
-- Plan 1 — synthesized workflow-diagram graphs.
--
-- Generated from captures at recompute time (engine in
-- services/synthesis/workflows/). Tenant users read; writes are service-role
-- only (recompute). Curated like opportunities: provisional → surfaced → hidden.

CREATE TABLE IF NOT EXISTS public.workflow_maps (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id),
  sprint_id      uuid NOT NULL REFERENCES public.sprints(id),
  kind           text NOT NULL,
  graph          jsonb NOT NULL,
  status         text NOT NULL DEFAULT 'provisional',
  opportunity_id uuid REFERENCES public.opportunities(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workflow_maps_tenant_idx
  ON public.workflow_maps(tenant_id);
CREATE INDEX IF NOT EXISTS workflow_maps_sprint_idx
  ON public.workflow_maps(sprint_id);

GRANT SELECT ON public.workflow_maps TO authenticated;
GRANT ALL ON public.workflow_maps TO service_role;

ALTER TABLE public.workflow_maps ENABLE ROW LEVEL SECURITY;

-- Tenant users only see their own surfaced/curated maps; never provisional.
CREATE POLICY "workflow_maps_tenant_select" ON public.workflow_maps FOR SELECT
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    AND status = 'surfaced'
  );

-- Twistag admins read every map (incl. provisional) for curation.
CREATE POLICY "workflow_maps_twistag_read" ON public.workflow_maps FOR SELECT
  USING ((auth.jwt() ->> 'twistag_role') IS NOT NULL);
```

> Note the tenant SELECT policy is `status = 'surfaced'` — this enforces the "never auto-show a client a provisional map" rule at the database, not just the UI.

- [ ] **Step 4: Add `workflow_maps` to the test `resetDb` TRUNCATE**

In `db/test/helpers.ts`, add `public.workflow_maps,` to the `TRUNCATE` list (put it right after `public.documents,`):

```typescript
    await tx.execute(
      sql`TRUNCATE public.documents, public.workflow_maps,
          public.stakeholder_opportunity, public.stakeholders,
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 6: Commit**

```bash
git add db/schema.ts db/migrations/0017_workflow_maps.sql db/test/helpers.ts
git commit -m "feat(db): workflow_maps table + RLS (tenant sees surfaced only)"
```

---

## Task 2: RLS isolation + no-clobber integration test

**Files:**
- Create: `db/workflow-maps.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `db/workflow-maps.integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  asUser,
  seedRow,
  withServiceRoleRaw,
  resetDb,
  seedTenants,
  TENANT_A,
  TENANT_B,
} from "./test/helpers";
import { sprints, workflowMaps } from "./schema";

const SPRINT_A = "00000000-0000-0000-0000-0000000005a1";

const sampleGraph = {
  kind: "swimlane",
  title: "Deal to order",
  lanes: [],
  steps: [{ id: "s1", label: "Log deal", laneId: null, stepKind: "step", inferred: false, captureIds: [], metric: null }],
  edges: [],
  confidence: { score: 0.8, coverage: 1, corroboratedCount: 1, disputedStepIds: [] },
  modelVersion: "test",
};

beforeEach(async () => {
  await resetDb();
  await seedTenants();
  await seedRow((tx) =>
    tx.insert(sprints).values({
      id: SPRINT_A,
      tenantId: TENANT_A,
      name: "Q2",
      primaryFocus: "ops",
      startDate: "2026-06-01",
      endDate: "2026-06-30",
      cadence: "weekly",
      status: "active",
    }),
  );
});

describe("workflow_maps — tenant isolation", () => {
  it("tenant A reads its own surfaced map; tenant B reads none", async () => {
    await seedRow((tx) =>
      tx.insert(workflowMaps).values({
        tenantId: TENANT_A,
        sprintId: SPRINT_A,
        kind: "swimlane",
        graph: sampleGraph,
        status: "surfaced",
      }),
    );

    const a = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(workflowMaps),
    );
    expect(a).toHaveLength(1);
    expect(a[0].kind).toBe("swimlane");

    const b = await asUser({ tenantId: TENANT_B }, (tx) =>
      tx.select().from(workflowMaps),
    );
    expect(b).toHaveLength(0);
  });

  it("tenant A cannot read its own provisional map (only surfaced)", async () => {
    await seedRow((tx) =>
      tx.insert(workflowMaps).values({
        tenantId: TENANT_A,
        sprintId: SPRINT_A,
        kind: "swimlane",
        graph: sampleGraph,
        status: "provisional",
      }),
    );
    const a = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(workflowMaps),
    );
    expect(a).toHaveLength(0);
  });

  it("delete-provisional preserves surfaced/hidden rows (no-clobber rule)", async () => {
    await seedRow((tx) =>
      tx.insert(workflowMaps).values([
        { tenantId: TENANT_A, sprintId: SPRINT_A, kind: "swimlane", graph: sampleGraph, status: "surfaced" },
        { tenantId: TENANT_A, sprintId: SPRINT_A, kind: "systems_topology", graph: sampleGraph, status: "provisional" },
      ]),
    );

    await withServiceRoleRaw((tx) =>
      tx
        .delete(workflowMaps)
        .where(and(eq(workflowMaps.sprintId, SPRINT_A), eq(workflowMaps.status, "provisional"))),
    );

    const rows = await withServiceRoleRaw((tx) => tx.select().from(workflowMaps));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("surfaced");
  });
});
```

- [ ] **Step 2: Run it to verify it passes**

Run: `npx vitest run -c vitest.integration.config.ts db/workflow-maps.integration.test.ts`
Expected: PASS (3 tests). If it errors with "relation workflow_maps does not exist", the integration harness isn't applying the new migration — grep the integration setup (`grep -rn "migrations" vitest.integration.config.ts db/test`) and ensure `db/migrations/*.sql` are all applied; the harness applies every file in `db/migrations/` in order.

- [ ] **Step 3: Commit**

```bash
git add db/workflow-maps.integration.test.ts
git commit -m "test(db): workflow_maps RLS isolation + no-clobber"
```

---

## Task 3: `workflowGraphDraft` + `workflowCritique` Zod schemas

**Files:**
- Modify: `services/llm/schemas.ts` (append near the stakeholder schema)

- [ ] **Step 1: Write a failing schema test**

Create `services/llm/workflow-schema.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { workflowGraphDraft, workflowCritique } from "./schemas";

describe("workflowGraphDraft", () => {
  it("applies defaults for omitted optional fields", () => {
    const parsed = workflowGraphDraft.parse({
      kind: "swimlane",
      title: "Deal to order",
      steps: [{ id: "s1", label: "Log deal", stepKind: "step" }],
    });
    expect(parsed.lanes).toEqual([]);
    expect(parsed.edges).toEqual([]);
    expect(parsed.steps[0].captureIds).toEqual([]);
    expect(parsed.steps[0].inferred).toBe(false);
    expect(parsed.steps[0].laneId).toBeNull();
    expect(parsed.steps[0].metric).toBeNull();
  });

  it("rejects a graph with zero steps", () => {
    const r = workflowGraphDraft.safeParse({ kind: "swimlane", title: "x", steps: [] });
    expect(r.success).toBe(false);
  });

  it("rejects a non-uuid captureId", () => {
    const r = workflowGraphDraft.safeParse({
      kind: "swimlane",
      title: "x",
      steps: [{ id: "s1", label: "y", stepKind: "step", captureIds: ["not-a-uuid"] }],
    });
    expect(r.success).toBe(false);
  });
});

describe("workflowCritique", () => {
  it("defaults both arrays to empty", () => {
    expect(workflowCritique.parse({})).toEqual({
      unsupportedStepIds: [],
      unsupportedEdgeIds: [],
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run services/llm/workflow-schema.test.ts`
Expected: FAIL ("workflowGraphDraft is not exported" / undefined).

- [ ] **Step 3: Add the schemas to `services/llm/schemas.ts`**

Append after the `stakeholderMap` block:

```typescript
/**
 * Workflow diagram graph (Plan 1). The LLM emits SEMANTIC STRUCTURE ONLY —
 * lanes/steps/edges, each citing captureIds (uuids). Internal graph ids
 * (step/lane/edge `id`, `from`, `to`) are short strings the model chooses, NOT
 * uuids. `confidence` and `modelVersion` are added server-side, not by the LLM.
 * NEVER contains names or contributor ids.
 */
export const workflowKind = z.enum([
  "swimlane",
  "before_after",
  "systems_topology",
  "impact_effort",
  "decision_flow",
  "handoff_network",
  "rework_loop",
  "journey_map",
  "raci_grid",
  "sipoc_strip",
]);

export const workflowLane = z.object({
  id: z.string().min(1).max(40),
  roleLabel: z.string().min(1).max(80),
  department: z.string().max(80).nullable().default(null),
});

export const workflowStep = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(120),
  laneId: z.string().max(40).nullable().default(null),
  stepKind: z.enum([
    "step",
    "decision",
    "system",
    "shadow_tool",
    "gap",
    "start",
    "end",
  ]),
  inferred: z.boolean().default(false),
  captureIds: z.array(z.string().uuid()).default([]),
  // Set only for kind = 'impact_effort' (effort=x, impact=y). LLM leaves null.
  metric: z
    .object({ x: z.number(), y: z.number() })
    .nullable()
    .default(null),
});

export const workflowEdge = z.object({
  id: z.string().min(1).max(40),
  from: z.string().min(1).max(40),
  to: z.string().min(1).max(40),
  edgeKind: z.enum(["flow", "handoff", "gap"]),
  label: z.string().max(40).nullable().default(null),
  inferred: z.boolean().default(false),
  captureIds: z.array(z.string().uuid()).default([]),
});

export const workflowGraphDraft = z.object({
  kind: workflowKind,
  title: z.string().min(2).max(120),
  lanes: z.array(workflowLane).default([]),
  steps: z.array(workflowStep).min(1),
  edges: z.array(workflowEdge).default([]),
});

export const workflowCritique = z.object({
  unsupportedStepIds: z.array(z.string().max(40)).default([]),
  unsupportedEdgeIds: z.array(z.string().max(40)).default([]),
});

export type WorkflowKind = z.infer<typeof workflowKind>;
export type WorkflowLane = z.infer<typeof workflowLane>;
export type WorkflowStep = z.infer<typeof workflowStep>;
export type WorkflowEdge = z.infer<typeof workflowEdge>;
export type WorkflowGraphDraft = z.infer<typeof workflowGraphDraft>;
export type WorkflowCritique = z.infer<typeof workflowCritique>;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run services/llm/workflow-schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add services/llm/schemas.ts services/llm/workflow-schema.test.ts
git commit -m "feat(llm): workflowGraphDraft + workflowCritique Zod schemas"
```

---

## Task 4: Service types + stats/routing (pure)

**Files:**
- Create: `services/synthesis/workflows/types.ts`
- Create: `services/synthesis/workflows/stats.ts`
- Create: `services/synthesis/workflows/stats.test.ts`

- [ ] **Step 1: Write `types.ts`**

```typescript
import type { WorkflowGraphDraft } from "@/services/llm/schemas";

/**
 * A capture as the workflow engine sees it. `role` + `department` are sent to
 * the LLM (no names). `contributorId` is SERVER-ONLY — used for corroboration
 * scoring; it is NEVER included in any LLM prompt.
 */
export interface WorkflowCapture {
  id: string; // capture uuid
  kind: string;
  summary: string;
  role: string;
  department: string | null;
  contributorId: string; // server-only — never sent to the model
}

/** Minimal opportunity shape for the impact/effort matrix. */
export interface OpportunityPoint {
  id: string;
  title: string;
  impactHigh: number;
  timeToShipWeeksHigh: number;
  horizon: string;
}

export interface WorkflowConfidence {
  score: number; // 0–1, computed (never model self-report)
  coverage: number; // 0–1
  corroboratedCount: number;
  disputedStepIds: string[];
}

/** The stored graph: an LLM draft (or pure-TS build) plus server-added fields. */
export interface WorkflowGraph extends WorkflowGraphDraft {
  confidence: WorkflowConfidence;
  modelVersion: string;
}
```

- [ ] **Step 2: Write the failing test `stats.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { captureStats, routeKinds } from "./stats";
import type { WorkflowCapture } from "./types";

function cap(p: Partial<WorkflowCapture>): WorkflowCapture {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "sop",
    summary: "x",
    role: "Sales rep",
    department: "Sales",
    contributorId: "u1",
    ...p,
  };
}

describe("captureStats", () => {
  it("counts kinds, distinct roles, handoffs and systemish", () => {
    const s = captureStats([
      cap({ kind: "handoff", role: "Sales rep" }),
      cap({ kind: "sop", role: "Ops" }),
      cap({ kind: "tooling", role: "Ops" }),
      cap({ kind: "workaround", role: "Finance" }),
    ]);
    expect(s.total).toBe(4);
    expect(s.distinctRoles).toBe(3);
    expect(s.handoffCount).toBe(1);
    expect(s.systemishCount).toBe(2);
    expect(s.stepish).toBe(3); // handoff + sop + workaround
  });
});

describe("routeKinds", () => {
  it("includes swimlane only with ≥3 stepish, ≥2 roles, ≥1 handoff", () => {
    const eligible = captureStats([
      cap({ kind: "handoff", role: "Sales rep" }),
      cap({ kind: "sop", role: "Ops" }),
      cap({ kind: "decision", role: "Finance" }),
    ]);
    expect(routeKinds(eligible, 0)).toContain("swimlane");

    const noHandoff = captureStats([
      cap({ kind: "sop", role: "Ops" }),
      cap({ kind: "decision", role: "Finance" }),
      cap({ kind: "bottleneck", role: "Sales rep" }),
    ]);
    expect(routeKinds(noHandoff, 0)).not.toContain("swimlane");
  });

  it("includes systems_topology with ≥2 tooling/workaround", () => {
    const s = captureStats([cap({ kind: "tooling" }), cap({ kind: "workaround" })]);
    expect(routeKinds(s, 0)).toContain("systems_topology");
  });

  it("includes impact_effort with ≥3 opportunities", () => {
    const s = captureStats([cap({})]);
    expect(routeKinds(s, 3)).toContain("impact_effort");
    expect(routeKinds(s, 2)).not.toContain("impact_effort");
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run services/synthesis/workflows/stats.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Write `stats.ts`**

```typescript
import type { WorkflowKind } from "@/services/llm/schemas";
import type { WorkflowCapture } from "./types";

export interface CaptureStats {
  total: number;
  byKind: Record<string, number>;
  distinctRoles: number;
  handoffCount: number;
  systemishCount: number;
  stepish: number;
}

export function captureStats(captures: WorkflowCapture[]): CaptureStats {
  const byKind: Record<string, number> = {};
  const roles = new Set<string>();
  for (const c of captures) {
    byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
    if (c.role) roles.add(c.role);
  }
  const k = (n: string) => byKind[n] ?? 0;
  return {
    total: captures.length,
    byKind,
    distinctRoles: roles.size,
    handoffCount: k("handoff"),
    systemishCount: k("tooling") + k("workaround"),
    stepish:
      k("sop") + k("decision") + k("handoff") + k("bottleneck") + k("workaround"),
  };
}

/**
 * Deterministic routing: which diagram kinds have enough signal to attempt.
 * Plan 1 produces swimlane, systems_topology, impact_effort only. Thresholds
 * are conservative and meant to be tuned against real sprint data (spec §15).
 */
export function routeKinds(
  stats: CaptureStats,
  opportunityCount: number,
): WorkflowKind[] {
  const kinds: WorkflowKind[] = [];
  if (stats.stepish >= 3 && stats.distinctRoles >= 2 && stats.handoffCount >= 1) {
    kinds.push("swimlane");
  }
  if (stats.systemishCount >= 2) {
    kinds.push("systems_topology");
  }
  if (opportunityCount >= 3) {
    kinds.push("impact_effort");
  }
  return kinds;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run services/synthesis/workflows/stats.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add services/synthesis/workflows/types.ts services/synthesis/workflows/stats.ts services/synthesis/workflows/stats.test.ts
git commit -m "feat(workflows): capture stats + deterministic kind routing"
```

---

## Task 5: `validateGraph` (pure — drops ungrounded elements)

**Files:**
- Create: `services/synthesis/workflows/validate.ts`
- Create: `services/synthesis/workflows/validate.test.ts`

- [ ] **Step 1: Write the failing test `validate.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { validateGraph } from "./validate";
import type { WorkflowGraphDraft } from "@/services/llm/schemas";

const C1 = "11111111-1111-4111-8111-111111111111";
const C2 = "22222222-2222-4222-8222-222222222222";
const FAKE = "99999999-9999-4999-8999-999999999999";

function graph(over: Partial<WorkflowGraphDraft>): WorkflowGraphDraft {
  return {
    kind: "swimlane",
    title: "t",
    lanes: [{ id: "lane-sales", roleLabel: "Sales", department: null }],
    steps: [],
    edges: [],
    ...over,
  };
}

describe("validateGraph", () => {
  const known = new Set([C1, C2]);

  it("drops a step with no real captureIds that is not inferred", () => {
    const g = graph({
      steps: [
        { id: "s1", label: "real", laneId: "lane-sales", stepKind: "step", inferred: false, captureIds: [C1], metric: null },
        { id: "s2", label: "ghost", laneId: "lane-sales", stepKind: "step", inferred: false, captureIds: [FAKE], metric: null },
      ],
    });
    const out = validateGraph(g, known);
    expect(out.steps.map((s) => s.id)).toEqual(["s1"]);
  });

  it("keeps an inferred step with no captures, but filters fake ids", () => {
    const g = graph({
      steps: [
        { id: "s1", label: "gap", laneId: "lane-sales", stepKind: "step", inferred: true, captureIds: [FAKE], metric: null },
      ],
    });
    const out = validateGraph(g, known);
    expect(out.steps).toHaveLength(1);
    expect(out.steps[0].captureIds).toEqual([]);
  });

  it("nulls a laneId that references a missing lane and prunes unused lanes", () => {
    const g = graph({
      lanes: [
        { id: "lane-sales", roleLabel: "Sales", department: null },
        { id: "lane-ghost", roleLabel: "Nobody", department: null },
      ],
      steps: [
        { id: "s1", label: "x", laneId: "lane-missing", stepKind: "step", inferred: false, captureIds: [C1], metric: null },
      ],
    });
    const out = validateGraph(g, known);
    expect(out.steps[0].laneId).toBeNull();
    expect(out.lanes).toEqual([]); // no surviving step references any lane
  });

  it("drops an edge whose endpoints don't both survive", () => {
    const g = graph({
      steps: [
        { id: "s1", label: "a", laneId: null, stepKind: "step", inferred: false, captureIds: [C1], metric: null },
        { id: "s2", label: "ghost", laneId: null, stepKind: "step", inferred: false, captureIds: [FAKE], metric: null },
      ],
      edges: [
        { id: "e1", from: "s1", to: "s2", edgeKind: "handoff", label: null, inferred: false, captureIds: [C2] },
      ],
    });
    const out = validateGraph(g, known);
    expect(out.steps.map((s) => s.id)).toEqual(["s1"]);
    expect(out.edges).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run services/synthesis/workflows/validate.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `validate.ts`**

```typescript
import type { WorkflowGraphDraft } from "@/services/llm/schemas";

/**
 * Deterministic grounding guard. Drops any step/edge that is not backed by a
 * real capture (unless explicitly `inferred`), filters fabricated captureIds,
 * nulls dangling laneIds, removes edges whose endpoints didn't survive, and
 * prunes unreferenced lanes. This is the layer that kills a hallucinated step
 * carrying a made-up citation.
 */
export function validateGraph(
  graph: WorkflowGraphDraft,
  knownCaptureIds: Set<string>,
): WorkflowGraphDraft {
  const laneIds = new Set(graph.lanes.map((l) => l.id));

  const steps = graph.steps
    .map((s) => ({
      ...s,
      captureIds: s.captureIds.filter((id) => knownCaptureIds.has(id)),
    }))
    .filter((s) => s.captureIds.length > 0 || s.inferred)
    .map((s) => ({
      ...s,
      laneId: s.laneId && laneIds.has(s.laneId) ? s.laneId : null,
    }));

  const stepIds = new Set(steps.map((s) => s.id));

  const edges = graph.edges
    .filter((e) => stepIds.has(e.from) && stepIds.has(e.to))
    .map((e) => ({
      ...e,
      captureIds: e.captureIds.filter((id) => knownCaptureIds.has(id)),
    }))
    .filter((e) => e.captureIds.length > 0 || e.inferred);

  const usedLaneIds = new Set(
    steps.map((s) => s.laneId).filter((id): id is string => id !== null),
  );
  const lanes = graph.lanes.filter((l) => usedLaneIds.has(l.id));

  return { ...graph, lanes, steps, edges };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run services/synthesis/workflows/validate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add services/synthesis/workflows/validate.ts services/synthesis/workflows/validate.test.ts
git commit -m "feat(workflows): deterministic graph validator (drops ungrounded)"
```

---

## Task 6: `scoreConfidence` (pure — computed, not self-reported)

**Files:**
- Create: `services/synthesis/workflows/confidence.ts`
- Create: `services/synthesis/workflows/confidence.test.ts`

- [ ] **Step 1: Write the failing test `confidence.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { scoreConfidence } from "./confidence";
import type { WorkflowCapture } from "./types";
import type { WorkflowGraphDraft } from "@/services/llm/schemas";

const C1 = "11111111-1111-4111-8111-111111111111";
const C2 = "22222222-2222-4222-8222-222222222222";

function cap(id: string, contributorId: string): WorkflowCapture {
  return { id, kind: "handoff", summary: "x", role: "Ops", department: null, contributorId };
}

function graph(captureIds: string[]): WorkflowGraphDraft {
  return {
    kind: "swimlane",
    title: "t",
    lanes: [],
    steps: [{ id: "s1", label: "a", laneId: null, stepKind: "step", inferred: false, captureIds, metric: null }],
    edges: [],
  };
}

describe("scoreConfidence", () => {
  it("counts an element as corroborated when ≥2 distinct contributors back it", () => {
    const caps = [cap(C1, "u1"), cap(C2, "u2")];
    const out = scoreConfidence(graph([C1, C2]), caps);
    expect(out.corroboratedCount).toBe(1);
    expect(out.coverage).toBe(1);
    expect(out.score).toBe(1);
  });

  it("does not corroborate a single-contributor element", () => {
    const caps = [cap(C1, "u1"), cap(C2, "u1")];
    const out = scoreConfidence(graph([C1, C2]), caps);
    expect(out.corroboratedCount).toBe(0);
    // coverage = 2/2 = 1, corroborationRatio = 0 → score = 0.5
    expect(out.score).toBeCloseTo(0.5, 5);
  });

  it("lowers coverage when most captures go unused", () => {
    const caps = [cap(C1, "u1"), cap(C2, "u2")];
    const out = scoreConfidence(graph([C1]), caps); // only 1 of 2 used
    expect(out.coverage).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run services/synthesis/workflows/confidence.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `confidence.ts`**

```typescript
import type { WorkflowGraphDraft } from "@/services/llm/schemas";
import type { WorkflowCapture } from "./types";

/**
 * Confidence derived from grounding facts — never the model's self-report.
 *   coverage          = distinct captures used / total captures
 *   corroboratedCount = elements (steps+edges) backed by ≥2 distinct contributors
 *   score             = 0.5·coverage + 0.5·(corroborated / elements)
 * `disputedStepIds` is filled by the orchestrator from the critic; this pure
 * function does not detect semantic conflict.
 */
export function scoreConfidence(
  graph: WorkflowGraphDraft,
  captures: WorkflowCapture[],
): { score: number; coverage: number; corroboratedCount: number } {
  const contributorByCapture = new Map(
    captures.map((c) => [c.id, c.contributorId]),
  );
  const elements = [...graph.steps, ...graph.edges];
  const used = new Set<string>();
  let corroborated = 0;

  for (const el of elements) {
    const contributors = new Set<string>();
    for (const cid of el.captureIds) {
      used.add(cid);
      const who = contributorByCapture.get(cid);
      if (who) contributors.add(who);
    }
    if (contributors.size >= 2) corroborated++;
  }

  const coverage =
    captures.length === 0 ? 0 : Math.min(1, used.size / captures.length);
  const corroborationRatio =
    elements.length === 0 ? 0 : corroborated / elements.length;
  const score = Math.min(1, 0.5 * coverage + 0.5 * corroborationRatio);

  return { score, coverage, corroboratedCount: corroborated };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run services/synthesis/workflows/confidence.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add services/synthesis/workflows/confidence.ts services/synthesis/workflows/confidence.test.ts
git commit -m "feat(workflows): computed confidence (coverage + corroboration)"
```

---

## Task 7: `buildImpactEffort` (pure — no LLM)

**Files:**
- Create: `services/synthesis/workflows/impact-effort.ts`
- Create: `services/synthesis/workflows/impact-effort.test.ts`

- [ ] **Step 1: Write the failing test `impact-effort.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { buildImpactEffort } from "./impact-effort";
import type { OpportunityPoint } from "./types";

const opps: OpportunityPoint[] = [
  { id: "o1", title: "Auto-sync ERP", impactHigh: 120000, timeToShipWeeksHigh: 3, horizon: "quick_win" },
  { id: "o2", title: "Self-serve refunds", impactHigh: 80000, timeToShipWeeksHigh: 8, horizon: "strategic_bet" },
];

describe("buildImpactEffort", () => {
  it("builds a metric-bearing step per opportunity with confidence 1", () => {
    const g = buildImpactEffort(opps);
    expect(g.kind).toBe("impact_effort");
    expect(g.steps).toHaveLength(2);
    expect(g.steps[0].label).toBe("Auto-sync ERP");
    expect(g.steps[0].metric).toEqual({ x: 3, y: 120000 });
    expect(g.steps[0].captureIds).toEqual([]);
    expect(g.confidence.score).toBe(1);
    expect(g.modelVersion).toBe("pure-ts");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run services/synthesis/workflows/impact-effort.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `impact-effort.ts`**

```typescript
import type { OpportunityPoint, WorkflowGraph } from "./types";

/**
 * Pure-TS impact/effort matrix — NO LLM call. Each opportunity becomes a step
 * carrying `metric = { x: effort weeks, y: impact $ }`; the renderer scales the
 * axes. Confidence is 1 because the inputs are already-computed scores.
 */
export function buildImpactEffort(opps: OpportunityPoint[]): WorkflowGraph {
  return {
    kind: "impact_effort",
    title: "Impact vs. effort",
    lanes: [],
    steps: opps.map((o, i) => ({
      id: `opp-${i}`,
      label: o.title,
      laneId: null,
      stepKind: "step" as const,
      inferred: false,
      captureIds: [],
      metric: { x: o.timeToShipWeeksHigh, y: o.impactHigh },
    })),
    edges: [],
    confidence: {
      score: 1,
      coverage: 1,
      corroboratedCount: opps.length,
      disputedStepIds: [],
    },
    modelVersion: "pure-ts",
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run services/synthesis/workflows/impact-effort.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add services/synthesis/workflows/impact-effort.ts services/synthesis/workflows/impact-effort.test.ts
git commit -m "feat(workflows): pure-TS impact/effort matrix builder"
```

---

## Task 8: `generateGraph` + `KIND_PROMPTS` + `critiqueGraph` (LLM)

**Files:**
- Create: `services/synthesis/workflows/generate.ts`
- Create: `services/synthesis/workflows/generate.test.ts`

- [ ] **Step 1: Write the failing test `generate.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const completeStructured = vi.fn();
vi.mock("@/services/llm/client", () => ({
  completeStructured: (...args: unknown[]) => completeStructured(...args),
}));

import { generateGraph, critiqueGraph } from "./generate";
import type { WorkflowCapture } from "./types";

const C1 = "11111111-1111-4111-8111-111111111111";

function cap(p: Partial<WorkflowCapture>): WorkflowCapture {
  return {
    id: C1,
    kind: "handoff",
    summary: "Sales emails the deal to ops",
    role: "Sales rep",
    department: "Sales",
    contributorId: "SECRET-USER-ID",
    ...p,
  };
}

beforeEach(() => completeStructured.mockReset());

describe("generateGraph", () => {
  it("returns null without an LLM call when no relevant captures", async () => {
    const out = await generateGraph("swimlane", [cap({ kind: "frustration" })], ["Sales rep"]);
    expect(out).toBeNull();
    expect(completeStructured).not.toHaveBeenCalled();
  });

  it("never sends contributorId (or names) to the model, but does send role", async () => {
    completeStructured.mockResolvedValue({ kind: "swimlane", title: "t", lanes: [], steps: [], edges: [] });
    await generateGraph("swimlane", [cap({})], ["Sales rep"]);
    const content = completeStructured.mock.calls[0][0].messages[0].content as string;
    expect(content).toContain(C1);
    expect(content).toContain("Sales rep");
    expect(content).not.toContain("SECRET-USER-ID");
  });

  it("forces the returned kind to the requested kind", async () => {
    completeStructured.mockResolvedValue({ kind: "decision_flow", title: "t", lanes: [], steps: [], edges: [] });
    const out = await generateGraph("swimlane", [cap({})], ["Sales rep"]);
    expect(out?.kind).toBe("swimlane");
  });
});

describe("critiqueGraph", () => {
  it("returns the unsupported ids the model flags", async () => {
    completeStructured.mockResolvedValue({ unsupportedStepIds: ["s2"], unsupportedEdgeIds: [] });
    const out = await critiqueGraph(
      {
        kind: "swimlane",
        title: "t",
        lanes: [],
        steps: [{ id: "s2", label: "x", laneId: null, stepKind: "step", inferred: false, captureIds: [C1], metric: null }],
        edges: [],
      },
      [cap({})],
    );
    expect(out.unsupportedStepIds).toEqual(["s2"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run services/synthesis/workflows/generate.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `generate.ts`**

```typescript
import { completeStructured } from "@/services/llm/client";
import {
  workflowGraphDraft,
  workflowCritique,
  type WorkflowGraphDraft,
  type WorkflowCritique,
  type WorkflowKind,
} from "@/services/llm/schemas";
import type { WorkflowCapture } from "./types";

interface KindPromptConfig {
  relevantKinds: Set<string>;
  system: (roleLabels: string[]) => string;
}

function rulesBlock(roleLabels: string[]): string {
  return [
    "RULES:",
    "1. Use ONLY these captureIds — never invent one:",
    "   they are the uuids prefixed on each capture line below.",
    "2. Every step and edge MUST cite the captureIds it is based on. If you add a",
    "   connecting step that no capture directly supports, set inferred=true and",
    "   leave captureIds empty — never present a guess as observed fact.",
    "3. Lanes represent roles. Use ONLY these role labels for lanes:",
    `   ${roleLabels.join(", ") || "(none provided)"}.`,
    "4. Plain words only. No marketing language. No names of people.",
    "5. step/lane/edge `id` values are short slugs you choose (e.g. 's1',",
    "   'lane-ops'); `from`/`to` reference step ids; captureIds are the uuids.",
  ].join("\n");
}

const swimlaneSystem = (roleLabels: string[]): string =>
  [
    "You map how operational work actually flows, as a cross-functional",
    "swimlane. Lanes are roles; a step sits in the lane of whoever does it; an",
    "edge from a step in one lane to a step in another lane is a handoff",
    "(edgeKind='handoff'). Same-lane progression is edgeKind='flow'. Mark a",
    "step that is a known pain point with stepKind='step' and cite the",
    "bottleneck/workaround capture as its evidence.",
    "",
    rulesBlock(roleLabels),
    "",
    "Return JSON matching: { kind:'swimlane', title, lanes:[{id,roleLabel,",
    "department}], steps:[{id,label,laneId,stepKind,inferred,captureIds}],",
    "edges:[{id,from,to,edgeKind,label,inferred,captureIds}] }.",
  ].join("\n");

const topologySystem = (roleLabels: string[]): string =>
  [
    "You map the current-state SYSTEMS topology: tools as nodes, the data",
    "flow between them as edges. stepKind='system' for sanctioned tools,",
    "'shadow_tool' for unofficial spreadsheets/apps, 'gap' is not used for",
    "nodes. An edge where data is manually re-keyed between tools is",
    "edgeKind='gap'; an automated/clean connection is edgeKind='flow'. Lanes",
    "are not used here — leave lanes empty and laneId null.",
    "",
    rulesBlock(roleLabels),
    "",
    "Return JSON matching: { kind:'systems_topology', title, lanes:[], steps:[",
    "{id,label,laneId,stepKind,inferred,captureIds}], edges:[{id,from,to,",
    "edgeKind,label,inferred,captureIds}] }.",
  ].join("\n");

export const KIND_PROMPTS: Partial<Record<WorkflowKind, KindPromptConfig>> = {
  swimlane: {
    relevantKinds: new Set(["handoff", "sop", "decision", "bottleneck", "workaround"]),
    system: swimlaneSystem,
  },
  systems_topology: {
    relevantKinds: new Set(["tooling", "workaround"]),
    system: topologySystem,
  },
};

/** Capture lines sent to the model — id, kind, role, summary. NEVER contributorId/name. */
function captureLines(captures: WorkflowCapture[]): string {
  return captures
    .map((c) => `- ${c.id} [${c.kind}] (${c.role}) ${c.summary}`)
    .join("\n");
}

/**
 * Generate one diagram graph for `kind`. Returns null when there are no
 * relevant captures (nothing to draw). Forces the output `kind` to the
 * requested kind so the model can't drift the type.
 */
export async function generateGraph(
  kind: WorkflowKind,
  captures: WorkflowCapture[],
  roleLabels: string[],
): Promise<WorkflowGraphDraft | null> {
  const config = KIND_PROMPTS[kind];
  if (!config) throw new Error(`No prompt config for workflow kind: ${kind}`);

  const relevant = captures.filter((c) => config.relevantKinds.has(c.kind));
  if (relevant.length === 0) return null;

  const draft = await completeStructured({
    system: config.system(roleLabels),
    schema: workflowGraphDraft,
    maxTokens: 3072,
    messages: [
      {
        role: "user",
        content: [
          "Build the workflow graph from these captures.",
          "",
          "CAPTURES (id [kind] (role) summary):",
          captureLines(relevant),
        ].join("\n"),
      },
    ],
  });

  return { ...draft, kind };
}

function critiqueSystem(): string {
  return [
    "You are an adversarial reviewer of a synthesized workflow graph. For each",
    "step and edge you are given the exact capture evidence it cites. Flag any",
    "step or edge that OVERSTATES what its evidence supports, or whose evidence",
    "is '(none)' while it is presented as observed. Be strict: when in doubt,",
    "flag it. Do not flag steps/edges that are well supported.",
    "",
    "Return JSON: { unsupportedStepIds: [...], unsupportedEdgeIds: [...] }.",
  ].join("\n");
}

/**
 * Independent critic pass. Returns the ids the model judges unsupported; the
 * orchestrator drops them. Best-effort — callers handle a thrown LLM error.
 */
export async function critiqueGraph(
  graph: WorkflowGraphDraft,
  captures: WorkflowCapture[],
): Promise<WorkflowCritique> {
  const summaryById = new Map(captures.map((c) => [c.id, c.summary]));
  const ev = (ids: string[]): string =>
    ids
      .map((id) => summaryById.get(id))
      .filter((s): s is string => Boolean(s))
      .join(" | ") || "(none)";

  const stepLines = graph.steps
    .map((s) => `STEP ${s.id}: "${s.label}" — evidence: ${ev(s.captureIds)}`)
    .join("\n");
  const edgeLines = graph.edges
    .map((e) => `EDGE ${e.id}: ${e.from}->${e.to} (${e.edgeKind}) — evidence: ${ev(e.captureIds)}`)
    .join("\n");

  return completeStructured({
    system: critiqueSystem(),
    schema: workflowCritique,
    maxTokens: 1024,
    messages: [
      {
        role: "user",
        content: ["Review this graph against its evidence.", "", stepLines, "", edgeLines].join("\n"),
      },
    ],
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run services/synthesis/workflows/generate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add services/synthesis/workflows/generate.ts services/synthesis/workflows/generate.test.ts
git commit -m "feat(workflows): LLM graph generation + adversarial critic (no names/contributorId)"
```

---

## Task 9: `synthesizeWorkflows` orchestrator

**Files:**
- Create: `services/synthesis/workflows/synthesize.ts`
- Create: `services/synthesis/workflows/synthesize.test.ts`

- [ ] **Step 1: Write the failing test `synthesize.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const generateGraph = vi.fn();
const critiqueGraph = vi.fn();
vi.mock("./generate", () => ({
  generateGraph: (...a: unknown[]) => generateGraph(...a),
  critiqueGraph: (...a: unknown[]) => critiqueGraph(...a),
  KIND_PROMPTS: {},
}));

import { synthesizeWorkflows } from "./synthesize";
import type { WorkflowCapture, OpportunityPoint } from "./types";

const C1 = "11111111-1111-4111-8111-111111111111";
const C2 = "22222222-2222-4222-8222-222222222222";

function cap(id: string, contributorId: string): WorkflowCapture {
  return { id, kind: "handoff", summary: "x", role: "Ops", department: null, contributorId };
}

const swimlaneCaps: WorkflowCapture[] = [
  { id: C1, kind: "handoff", summary: "sales hands to ops", role: "Sales rep", department: "Sales", contributorId: "u1" },
  { id: C2, kind: "sop", summary: "ops re-keys", role: "Ops", department: "Ops", contributorId: "u2" },
  { id: "33333333-3333-4333-8333-333333333333", kind: "decision", summary: "finance signs", role: "Finance", department: "Finance", contributorId: "u3" },
];

const opps: OpportunityPoint[] = [
  { id: "o1", title: "A", impactHigh: 1, timeToShipWeeksHigh: 1, horizon: "quick_win" },
  { id: "o2", title: "B", impactHigh: 2, timeToShipWeeksHigh: 2, horizon: "standard" },
  { id: "o3", title: "C", impactHigh: 3, timeToShipWeeksHigh: 3, horizon: "strategic_bet" },
];

beforeEach(() => {
  generateGraph.mockReset();
  critiqueGraph.mockReset();
  critiqueGraph.mockResolvedValue({ unsupportedStepIds: [], unsupportedEdgeIds: [] });
});

describe("synthesizeWorkflows", () => {
  it("always emits a pure-TS impact_effort matrix when ≥3 opportunities", async () => {
    const out = await synthesizeWorkflows({ captures: [], opportunities: opps, roleLabels: [], modelVersion: "m" });
    expect(out.map((g) => g.kind)).toContain("impact_effort");
    expect(generateGraph).not.toHaveBeenCalled(); // no swimlane-eligible captures
  });

  it("keeps a well-grounded, corroborated swimlane", async () => {
    generateGraph.mockResolvedValue({
      kind: "swimlane",
      title: "Deal to order",
      lanes: [{ id: "l1", roleLabel: "Sales", department: "Sales" }],
      steps: [
        { id: "s1", label: "Log deal", laneId: "l1", stepKind: "step", inferred: false, captureIds: [C1], metric: null },
        { id: "s2", label: "Re-key", laneId: "l1", stepKind: "step", inferred: false, captureIds: [C2], metric: null },
      ],
      edges: [
        { id: "e1", from: "s1", to: "s2", edgeKind: "handoff", label: null, inferred: false, captureIds: [C1, C2] },
      ],
    });
    const out = await synthesizeWorkflows({ captures: swimlaneCaps, opportunities: [], roleLabels: ["Sales"], modelVersion: "m" });
    const sw = out.find((g) => g.kind === "swimlane");
    expect(sw).toBeDefined();
    expect(sw!.confidence.score).toBeGreaterThanOrEqual(0.3);
    expect(sw!.modelVersion).toBe("m");
  });

  it("abstains when the critic strips it below the minimum step count", async () => {
    generateGraph.mockResolvedValue({
      kind: "swimlane",
      title: "t",
      lanes: [],
      steps: [{ id: "s1", label: "x", laneId: null, stepKind: "step", inferred: false, captureIds: [C1], metric: null }],
      edges: [],
    });
    critiqueGraph.mockResolvedValue({ unsupportedStepIds: ["s1"], unsupportedEdgeIds: [] });
    const out = await synthesizeWorkflows({ captures: swimlaneCaps, opportunities: [], roleLabels: [], modelVersion: "m" });
    expect(out.find((g) => g.kind === "swimlane")).toBeUndefined();
  });

  it("skips a kind whose generation throws, without failing the batch", async () => {
    generateGraph.mockRejectedValue(new Error("LLM down"));
    const out = await synthesizeWorkflows({ captures: swimlaneCaps, opportunities: opps, roleLabels: [], modelVersion: "m" });
    expect(out.map((g) => g.kind)).toEqual(["impact_effort"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run services/synthesis/workflows/synthesize.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `synthesize.ts`**

```typescript
import type { WorkflowCritique, WorkflowGraphDraft } from "@/services/llm/schemas";
import { captureStats, routeKinds } from "./stats";
import { validateGraph } from "./validate";
import { scoreConfidence } from "./confidence";
import { buildImpactEffort } from "./impact-effort";
import { generateGraph, critiqueGraph } from "./generate";
import type { OpportunityPoint, WorkflowCapture, WorkflowGraph } from "./types";

const MIN_STEPS = 2;
const MIN_CONFIDENCE = 0.3; // conservative; tune against real sprints (spec §15)

export interface SynthesizeInput {
  captures: WorkflowCapture[];
  opportunities: OpportunityPoint[];
  roleLabels: string[];
  modelVersion: string;
}

/** Drop critic-flagged steps/edges, then re-validate to re-prune dangling refs. */
function applyCritique(
  graph: WorkflowGraphDraft,
  critique: WorkflowCritique,
  knownCaptureIds: Set<string>,
): WorkflowGraphDraft {
  const badSteps = new Set(critique.unsupportedStepIds);
  const badEdges = new Set(critique.unsupportedEdgeIds);
  const pruned: WorkflowGraphDraft = {
    ...graph,
    steps: graph.steps.filter((s) => !badSteps.has(s.id)),
    edges: graph.edges.filter((e) => !badEdges.has(e.id)),
  };
  return validateGraph(pruned, knownCaptureIds);
}

/**
 * The engine, end to end: route → generate → validate → critic → confidence →
 * gate. Returns only the graphs that PASS the gate (all status 'provisional');
 * below-threshold or under-supported diagrams are abstained (omitted). Never
 * throws for a single failing kind — that kind is skipped.
 */
export async function synthesizeWorkflows(
  input: SynthesizeInput,
): Promise<WorkflowGraph[]> {
  const { captures, opportunities, roleLabels, modelVersion } = input;
  const stats = captureStats(captures);
  const kinds = routeKinds(stats, opportunities.length);
  const known = new Set(captures.map((c) => c.id));
  const out: WorkflowGraph[] = [];

  if (kinds.includes("impact_effort")) {
    out.push(buildImpactEffort(opportunities));
  }

  for (const kind of kinds) {
    if (kind === "impact_effort") continue;

    let draft: WorkflowGraphDraft | null;
    try {
      draft = await generateGraph(kind, captures, roleLabels);
    } catch {
      continue; // best-effort: a failing kind never sinks the batch
    }
    if (!draft) continue;

    let cleaned = validateGraph(draft, known);

    let critique: WorkflowCritique = { unsupportedStepIds: [], unsupportedEdgeIds: [] };
    try {
      critique = await critiqueGraph(cleaned, captures);
    } catch {
      // best-effort: keep the validated graph if the critic is unavailable
    }
    cleaned = applyCritique(cleaned, critique, known);

    if (cleaned.steps.length < MIN_STEPS) continue; // abstain
    const scored = scoreConfidence(cleaned, captures);
    if (scored.score < MIN_CONFIDENCE) continue; // held

    out.push({
      ...cleaned,
      confidence: { ...scored, disputedStepIds: [] },
      modelVersion,
    });
  }

  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run services/synthesis/workflows/synthesize.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add services/synthesis/workflows/synthesize.ts services/synthesis/workflows/synthesize.test.ts
git commit -m "feat(workflows): synthesize orchestrator (route→generate→validate→critic→gate)"
```

---

## Task 10: Persist + wire into `recompute.ts`

**Files:**
- Modify: `services/opportunity/recompute.ts`
- Modify: `db/workflow-maps.integration.test.ts` (add a persistence roundtrip)

- [ ] **Step 1: Confirm the capture select exposes role, department, userId**

Run: `grep -n "captureRows\|users.title\|users.department\|userId" services/opportunity/recompute.ts | head`
Expected: the capture query already selects `users.title` (role), `users.department`, and the capture's `userId`. If any is missing from the select that feeds `captureRows`, add it — the call site below needs `c.title`, `c.department`, `c.userId`. Also identify the local array of scored/persisted opportunities (the rows used to build the portfolio); call it `opportunityRows` below — adapt to the actual variable name.

- [ ] **Step 2: Add imports + `buildWorkflowMaps` to `recompute.ts`**

At the top of `recompute.ts`, ensure `and` is imported from `drizzle-orm` (add to the existing `eq` import) and add the table + engine imports:

```typescript
import { and, eq } from "drizzle-orm";
import { workflowMaps } from "@/db/schema";
import { synthesizeWorkflows } from "@/services/synthesis/workflows/synthesize";
import type {
  OpportunityPoint,
  WorkflowCapture,
} from "@/services/synthesis/workflows/types";
```

Add this function next to `buildSystemsInventory`:

```typescript
/**
 * Synthesize workflow-diagram graphs and persist them (Plan 1). Idempotent for
 * PROVISIONAL rows only — curated (surfaced/hidden) maps are preserved across
 * recomputes. Best-effort: a synthesis failure leaves prior maps in place and
 * never fails recompute.
 */
async function buildWorkflowMaps(
  tx: Db,
  opts: {
    tenantId: string;
    sprintId: string;
    captures: WorkflowCapture[];
    opportunities: OpportunityPoint[];
    roleLabels: string[];
  },
): Promise<void> {
  let graphs;
  try {
    graphs = await synthesizeWorkflows({
      captures: opts.captures,
      opportunities: opts.opportunities,
      roleLabels: opts.roleLabels,
      modelVersion: `${process.env.ATLAS_LLM_MODEL ?? "claude-sonnet-4-6"}:wf-v1`,
    });
  } catch {
    return; // best-effort
  }

  // Replace provisional maps only; never clobber curated/surfaced rows.
  await tx
    .delete(workflowMaps)
    .where(
      and(
        eq(workflowMaps.sprintId, opts.sprintId),
        eq(workflowMaps.status, "provisional"),
      ),
    );

  for (const graph of graphs) {
    await tx.insert(workflowMaps).values({
      tenantId: opts.tenantId,
      sprintId: opts.sprintId,
      kind: graph.kind,
      graph,
      status: "provisional",
      opportunityId: null,
    });
  }
}
```

- [ ] **Step 3: Add the call site after `buildSystemsInventory`**

Immediately after the `await buildSystemsInventory(tx, { ... })` call in `runRecompute`, add:

```typescript
  // --- workflow diagram graphs (Plan 1) ------------------------------------
  await buildWorkflowMaps(tx, {
    tenantId,
    sprintId,
    captures: captureRows.map((c) => ({
      id: c.id,
      kind: c.kind,
      summary: c.summary,
      role: c.title ?? "",
      department: c.department ?? null,
      contributorId: c.userId,
    })),
    opportunities: opportunityRows.map((o) => ({
      id: o.id,
      title: o.title,
      impactHigh: o.impactHigh,
      timeToShipWeeksHigh: o.timeToShipWeeksHigh,
      horizon: o.horizon,
    })),
    roleLabels: [
      ...new Set(
        captureRows
          .map((c) => c.title)
          .filter((t): t is string => Boolean(t)),
      ),
    ],
  });
```

> If `opportunityRows` isn't the actual variable holding the scored opportunities, point `.map` at whatever array `recompute` already has of the persisted opportunities (it must expose `id`, `title`, `impactHigh`, `timeToShipWeeksHigh`, `horizon`). Do not add a new DB query — reuse the in-memory rows.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. If `c.title`/`c.department`/`c.userId` or `opportunityRows` don't exist, fix per Steps 1/3.

- [ ] **Step 5: Add a persistence roundtrip to the integration test**

Append to `db/workflow-maps.integration.test.ts` (it already imports what's needed except `desc` — add `desc` only if you sort; the test below does not):

```typescript
describe("workflow_maps — jsonb roundtrip", () => {
  it("stores and reads back a full graph payload", async () => {
    await seedRow((tx) =>
      tx.insert(workflowMaps).values({
        tenantId: TENANT_A,
        sprintId: SPRINT_A,
        kind: "impact_effort",
        graph: {
          kind: "impact_effort",
          title: "Impact vs. effort",
          lanes: [],
          steps: [
            { id: "opp-0", label: "Auto-sync", laneId: null, stepKind: "step", inferred: false, captureIds: [], metric: { x: 3, y: 120000 } },
          ],
          edges: [],
          confidence: { score: 1, coverage: 1, corroboratedCount: 1, disputedStepIds: [] },
          modelVersion: "pure-ts",
        },
        status: "surfaced",
      }),
    );
    const rows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(workflowMaps),
    );
    expect(rows).toHaveLength(1);
    const graph = rows[0].graph as { steps: { metric: { x: number; y: number } }[] };
    expect(graph.steps[0].metric).toEqual({ x: 3, y: 120000 });
  });
});
```

- [ ] **Step 6: Run the integration test**

Run: `npx vitest run -c vitest.integration.config.ts db/workflow-maps.integration.test.ts`
Expected: PASS (4 tests total).

- [ ] **Step 7: Run the full workflows unit suite + typecheck**

Run: `npx vitest run services/synthesis/workflows services/llm/workflow-schema.test.ts && npx tsc --noEmit`
Expected: PASS (all workflows unit tests green, no type errors).

- [ ] **Step 8: Commit**

```bash
git add services/opportunity/recompute.ts db/workflow-maps.integration.test.ts
git commit -m "feat(recompute): generate + persist workflow maps (provisional, no-clobber)"
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- §6 MVP kinds swimlane / systems_topology / impact_effort → Tasks 8, 7 + routing Task 4. `before_after` is explicitly Plan 3 (noted in scope).
- §7.1 graph schema + invariants → Task 3 (schema) + Task 5 (validator enforces ungrounded-drop, edge-ref, lane-ref, prune).
- §7.2 storage (JSONB, status, RLS, no separate evidence join) → Tasks 1–2; tenant-sees-`surfaced`-only enforced in the SELECT policy.
- §8 engine stages (route 8.1, generate 8.2, validate 8.3, critic 8.4, confidence 8.5, gate/abstain 8.6) → Tasks 4, 8, 5, 8, 6, 9.
- §8.7 human-curated default → tenant RLS hides provisional; surfacing transition is Plan 3.
- §8.8 determinism/idempotent-no-clobber/modelVersion → Task 10 (delete provisional only) + Task 9 (modelVersion) ; pure functions snapshot-stable.
- §11 privacy boundary → Task 8 test asserts `contributorId` never reaches the prompt; role is sent, names never present.

**Placeholder scan:** No TBD/TODO. The two "adapt to the real variable name" notes (Task 10) are guarded by a grep step and exact required field lists — not vague.

**Type consistency:** `WorkflowCapture`, `OpportunityPoint`, `WorkflowGraph`, `WorkflowConfidence` defined once in `types.ts`; `WorkflowGraphDraft`/`WorkflowKind`/`WorkflowCritique` from `schemas.ts`. `validateGraph(graph, knownCaptureIds)`, `scoreConfidence(graph, captures)`, `generateGraph(kind, captures, roleLabels)`, `critiqueGraph(graph, captures)`, `synthesizeWorkflows(input)`, `buildWorkflowMaps(tx, opts)` — signatures match across tasks. `metric` shape `{x,y}` consistent in schema, impact-effort, tests.
