# Workflow Maps — Curation & Before/After Implementation Plan (Plan 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (A) Let a Twistag admin curate workflow maps (surface/hide) before any client sees them — the credibility gate. (B) Generate and render an opportunity **before/after** workflow on the portfolio opportunities.

**Architecture:** Mirrors the existing opportunity curation exactly — `setWorkflowMapStatus` (service-role + audit) ← `twistag.workflowMapSetStatus` ← a `WorkflowCurationCard` fed by a bound server action. Before/after is stored as one `workflow_maps` row (`kind='before_after'`, `opportunityId` set) whose graph holds two swimlane `WorkflowGraph`s (`before`, `after`); the "after" is generated as an honest proposal (new/automated steps are `inferred`). Rendering reuses `WorkflowDiagram` twice — no new layout.

**Tech Stack:** TypeScript, tRPC (`twistagProcedure`), Drizzle + RLS, server actions, React client components, vitest.

**Spec:** `docs/superpowers/specs/2026-06-21-workflow-maps-design.md` (§8.7 curation, F before/after). **Depends on Plans 1 & 2** (the `workflow_maps` table + engine, `WorkflowGraph`, `WorkflowDiagram`, `loadWorkflowMaps`).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `lib/twistag-admin.ts` | `setWorkflowMapStatus` (service-role write + audit) | Modify |
| `services/synthesis/workflows/types.ts` | `BeforeAfterGraph`, `OpportunityWorkflowView`, `WorkflowCurationRow` | Modify |
| `lib/sprint-read.ts` | `loadWorkflowMapsForCuration`, `loadOpportunityWorkflow` | Modify |
| `server/trpc/routers/twistag.ts` | `workflowMapsForCuration`, `workflowMapSetStatus`, `resolveWorkflowTenant` | Modify |
| `server/trpc/routers/opportunity.ts` | `opportunity.workflow` query | Modify |
| `components/admin/WorkflowCurationCard.tsx` (+test) | Curation UI (preview + surface/hide) | Create |
| `app/(app)/admin/clients/[tenantId]/actions.ts` | `setWorkflowMapStatusAction` | Modify |
| `app/(app)/admin/clients/[tenantId]/page.tsx` | "Workflows" curation tab | Modify |
| `services/synthesis/workflows/before-after.ts` (+test) | `generateFutureState`, `buildBeforeAfter`, `pickWorkflowForOpportunity` | Create |
| `services/opportunity/recompute.ts` | `buildBeforeAfterMaps` + wiring | Modify |
| `components/workflow/BeforeAfterView.tsx` (+test) | Two stacked diagrams + caption | Create |
| `components/opportunity/OpportunityDetail.tsx` | "Before / after" tab | Modify |
| `app/(app)/sprint/[id]/opportunity/[oppId]/page.tsx` | fetch + pass `workflow` | Modify |

**Commands:** unit `npx vitest run <path>`; component `npx vitest run <path>`; integration `npx vitest run -c vitest.integration.config.ts <path>`; typecheck `npx tsc --noEmit`.

> Find the admin actions file first: `grep -rln "setOpportunityStatusAction" "app/(app)/admin/clients/[tenantId]"` — that file is where `setWorkflowMapStatusAction` goes (the table above assumes `actions.ts`; use the actual path).

---

## Task 1: `setWorkflowMapStatus` service write

**Files:**
- Modify: `lib/twistag-admin.ts`
- Modify: `db/workflow-maps.integration.test.ts`

- [ ] **Step 1: Write the failing integration test (append to `db/workflow-maps.integration.test.ts`)**

Add `setWorkflowMapStatus` to a `@/lib/twistag-admin` import and:

```typescript
import { setWorkflowMapStatus } from "@/lib/twistag-admin";

describe("setWorkflowMapStatus", () => {
  it("moves a provisional map to surfaced (service-role write)", async () => {
    const [seeded] = await seedRow((tx) =>
      tx
        .insert(workflowMaps)
        .values({
          tenantId: TENANT_A,
          sprintId: SPRINT_A,
          kind: "swimlane",
          status: "provisional",
          graph: sampleGraph,
        })
        .returning({ id: workflowMaps.id }),
    );

    await setWorkflowMapStatus(
      { userId: USER_A1, twistagRole: "owner" },
      TENANT_A,
      seeded.id,
      "surfaced",
    );

    const [row] = await withServiceRoleRaw((tx) =>
      tx.select().from(workflowMaps).where(eq(workflowMaps.id, seeded.id)),
    );
    expect(row.status).toBe("surfaced");
  });

  it("rejects an unknown status", async () => {
    await expect(
      setWorkflowMapStatus({ userId: USER_A1, twistagRole: "owner" }, TENANT_A, SPRINT_A, "bogus"),
    ).rejects.toThrow();
  });
});
```

> `USER_A1` is defined by Plan 2's `loadWorkflowMaps` test in this file; if running this task before that one, add `const USER_A1 = "00000000-0000-0000-0000-0000000000a1";`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run -c vitest.integration.config.ts db/workflow-maps.integration.test.ts`
Expected: FAIL (`setWorkflowMapStatus` not exported).

- [ ] **Step 3: Add `setWorkflowMapStatus` to `lib/twistag-admin.ts`**

Add `workflowMaps` to the `@/db/schema` import, then append (mirrors `setOpportunityStatus`; `TwistagActor` and `withServiceRole` already exist in this file):

```typescript
const WORKFLOW_STATUSES = ["provisional", "surfaced", "hidden"] as const;

/**
 * Move a workflow map between provisional/surfaced/hidden (Plan 3 curation).
 * Service-role write, audited. Tenant users only ever read `surfaced` maps
 * (RLS), so surfacing here is what makes a diagram client-visible.
 */
export async function setWorkflowMapStatus(
  actor: TwistagActor,
  tenantId: string,
  workflowMapId: string,
  status: string,
): Promise<void> {
  if (!(WORKFLOW_STATUSES as readonly string[]).includes(status)) {
    throw new Error("invalid status");
  }
  await withServiceRole(
    {
      action: "twistag.workflow.status",
      actor: actor.userId,
      tenantId,
      targetId: workflowMapId,
      metadata: { twistag_role: actor.twistagRole, status },
    },
    async (tx) => {
      const [row] = await tx
        .select({ id: workflowMaps.id })
        .from(workflowMaps)
        .where(
          and(eq(workflowMaps.id, workflowMapId), eq(workflowMaps.tenantId, tenantId)),
        );
      if (!row) throw new Error("not found");
      await tx
        .update(workflowMaps)
        .set({ status, updatedAt: new Date() })
        .where(
          and(eq(workflowMaps.id, workflowMapId), eq(workflowMaps.tenantId, tenantId)),
        );
    },
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run -c vitest.integration.config.ts db/workflow-maps.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/twistag-admin.ts db/workflow-maps.integration.test.ts
git commit -m "feat(twistag): setWorkflowMapStatus (service-role, audited)"
```

---

## Task 2: Curation read + tRPC procedures

**Files:**
- Modify: `services/synthesis/workflows/types.ts`
- Modify: `lib/sprint-read.ts`
- Modify: `server/trpc/routers/twistag.ts`

- [ ] **Step 1: Add types to `services/synthesis/workflows/types.ts`**

```typescript
/** Before/after pair stored in one workflow_maps row (kind='before_after'). */
export interface BeforeAfterGraph {
  kind: "before_after";
  title: string;
  before: WorkflowGraph;
  after: WorkflowGraph;
}

/** A workflow map row prepared for the Twistag curation list. */
export interface WorkflowCurationRow {
  id: string;
  kind: WorkflowKind;
  title: string;
  status: string;
  sprintId: string;
  opportunityId: string | null;
  confidenceScore: number;
  previewGraph: WorkflowGraph;
}

/** The before/after pair resolved for an opportunity's detail page. */
export interface OpportunityWorkflowView {
  id: string;
  title: string;
  before: WorkflowGraph;
  after: WorkflowGraph;
}
```

- [ ] **Step 2: Add `loadWorkflowMapsForCuration` to `lib/sprint-read.ts`**

Add the type imports (`BeforeAfterGraph`, `WorkflowCurationRow`, `OpportunityWorkflowView`) to the existing `@/services/synthesis/workflows/types` import, then:

```typescript
/**
 * Every workflow map for a tenant, for the Twistag curation list. Runs under a
 * Twistag context (RLS twistag_read) so it includes provisional maps. The
 * preview is the renderable graph: for a before/after row it's the proposed
 * `after`.
 */
export async function loadWorkflowMapsForCuration(
  tx: Db,
  tenantId: string,
): Promise<WorkflowCurationRow[]> {
  const rows = await tx
    .select({
      id: workflowMaps.id,
      kind: workflowMaps.kind,
      status: workflowMaps.status,
      sprintId: workflowMaps.sprintId,
      opportunityId: workflowMaps.opportunityId,
      graph: workflowMaps.graph,
    })
    .from(workflowMaps)
    .where(eq(workflowMaps.tenantId, tenantId))
    .orderBy(desc(workflowMaps.createdAt));

  return rows.map((r) => {
    const raw = r.graph as WorkflowGraph | BeforeAfterGraph;
    const preview = raw.kind === "before_after" ? raw.after : raw;
    return {
      id: r.id,
      kind: r.kind as WorkflowCurationRow["kind"],
      title: raw.title,
      status: r.status,
      sprintId: r.sprintId,
      opportunityId: r.opportunityId,
      confidenceScore: preview.confidence.score,
      previewGraph: preview,
    };
  });
}
```

- [ ] **Step 3: Add the tRPC procedures to `server/trpc/routers/twistag.ts`**

Add imports: `workflowMaps` to `@/db/schema`, `setWorkflowMapStatus` to `@/lib/twistag-admin`, `loadWorkflowMapsForCuration` to `@/lib/sprint-read`. Add the procedures + tenant resolver (mirrors `resolveOpportunityTenant`):

```typescript
  /** All workflow maps for a tenant (incl. provisional) for curation. */
  workflowMapsForCuration: twistagProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      withTwistagContext(
        {
          twistagRole: ctx.session.twistagRole,
          actor: ctx.session.userId,
          tenantId: input.tenantId,
        },
        (tx) => loadWorkflowMapsForCuration(tx, input.tenantId),
      ),
    ),

  /** Curate a workflow map: provisional ↔ surfaced ↔ hidden. */
  workflowMapSetStatus: twistagProcedure
    .input(
      z.object({
        workflowMapId: z.string().uuid(),
        status: z.enum(["provisional", "surfaced", "hidden"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = await resolveWorkflowTenant(ctx, input.workflowMapId);
      await setWorkflowMapStatus(
        { userId: ctx.session.userId, twistagRole: ctx.session.twistagRole },
        tenantId,
        input.workflowMapId,
        input.status,
      );
      return { ok: true as const };
    }),
```

Add the resolver next to `resolveOpportunityTenant`:

```typescript
async function resolveWorkflowTenant(
  ctx: { session: { twistagRole: string; userId: string } },
  workflowMapId: string,
): Promise<string> {
  const found = await withTwistagContext(
    {
      twistagRole: ctx.session.twistagRole,
      actor: ctx.session.userId,
      targetId: workflowMapId,
    },
    async (tx) => {
      const [m] = await tx
        .select({ tenantId: workflowMaps.tenantId })
        .from(workflowMaps)
        .where(eq(workflowMaps.id, workflowMapId));
      return m ?? null;
    },
  );
  if (!found) throw new TRPCError({ code: "NOT_FOUND" });
  return found.tenantId;
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/synthesis/workflows/types.ts lib/sprint-read.ts server/trpc/routers/twistag.ts
git commit -m "feat(twistag): workflow map curation read + procedures"
```

---

## Task 3: `WorkflowCurationCard` component

**Files:**
- Create: `components/admin/WorkflowCurationCard.tsx`
- Create: `components/admin/WorkflowCurationCard.test.tsx`

- [ ] **Step 1: Write the failing test `WorkflowCurationCard.test.tsx`**

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkflowCurationCard } from "./WorkflowCurationCard";
import type { WorkflowCurationRow } from "@/services/synthesis/workflows/types";

const row: WorkflowCurationRow = {
  id: "wm1",
  kind: "swimlane",
  title: "Deal to order",
  status: "provisional",
  sprintId: "sp1",
  opportunityId: null,
  confidenceScore: 0.82,
  previewGraph: {
    kind: "swimlane",
    title: "Deal to order",
    lanes: [{ id: "l1", roleLabel: "Sales", department: null }],
    steps: [{ id: "s1", label: "Log deal", laneId: "l1", stepKind: "step", inferred: false, captureIds: [], metric: null }],
    edges: [],
    confidence: { score: 0.82, coverage: 1, corroboratedCount: 1, disputedStepIds: [] },
    modelVersion: "m",
  },
};

describe("WorkflowCurationCard", () => {
  it("shows the title, a diagram preview and the confidence", () => {
    render(<WorkflowCurationCard map={row} onSetStatus={vi.fn().mockResolvedValue(undefined)} />);
    expect(screen.getByText("Deal to order")).toBeTruthy();
    expect(document.querySelector("svg")).not.toBeNull();
    expect(screen.getByText(/82%/)).toBeTruthy();
  });

  it("calls onSetStatus('surfaced') when Surface is clicked", async () => {
    const onSetStatus = vi.fn().mockResolvedValue(undefined);
    render(<WorkflowCurationCard map={row} onSetStatus={onSetStatus} />);
    fireEvent.click(screen.getByRole("button", { name: /surfaced/i }));
    expect(onSetStatus).toHaveBeenCalledWith("wm1", "surfaced");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/admin/WorkflowCurationCard.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `WorkflowCurationCard.tsx`**

```typescript
"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { WorkflowDiagram } from "@/components/workflow/WorkflowDiagram";
import type { WorkflowCurationRow } from "@/services/synthesis/workflows/types";

const STATUSES = ["provisional", "surfaced", "hidden"] as const;
const STATUS_LABEL: Record<string, string> = {
  provisional: "Provisional",
  surfaced: "Surfaced",
  hidden: "Hidden",
};

/**
 * Twistag curation of one workflow map. Preview + surface/hide. Surfacing is
 * what makes the diagram visible to the client (tenant RLS = surfaced only),
 * so this is the credibility gate — verify the diagram against its evidence in
 * the linked report/opportunity before surfacing.
 */
export function WorkflowCurationCard({
  map,
  onSetStatus,
}: {
  map: WorkflowCurationRow;
  onSetStatus: (
    workflowMapId: string,
    status: "provisional" | "surfaced" | "hidden",
  ) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function change(status: "provisional" | "surfaced" | "hidden") {
    setError(null);
    start(async () => {
      try {
        await onSetStatus(map.id, status);
      } catch {
        setError("Couldn't change status.");
      }
    });
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate font-medium">{map.title}</span>
        <Badge tone="neutral">{map.kind.replace(/_/g, " ")}</Badge>
        <span className="text-xs text-text-3">
          {Math.round(map.confidenceScore * 100)}% confidence
        </span>
      </div>

      <div className="mb-3 overflow-x-auto rounded border border-border bg-surface p-2">
        <WorkflowDiagram graph={map.previewGraph} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-text-2">Status:</span>
        {STATUSES.map((s) => (
          <Button
            key={s}
            type="button"
            size="sm"
            variant={map.status === s ? "brand" : "secondary"}
            disabled={pending || map.status === s}
            onClick={() => change(s)}
          >
            {STATUS_LABEL[s]}
          </Button>
        ))}
      </div>

      {error ? (
        <span role="alert" className="mt-2 block text-xs text-danger">
          {error}
        </span>
      ) : null}
    </Card>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/admin/WorkflowCurationCard.test.tsx`
Expected: PASS (2 tests). If the testing-library import differs, mirror `components/admin/OpportunityCurationCard.tsx`'s test or another `components/**/*.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add components/admin/WorkflowCurationCard.tsx components/admin/WorkflowCurationCard.test.tsx
git commit -m "feat(admin): WorkflowCurationCard (preview + surface/hide)"
```

---

## Task 4: Server action + admin "Workflows" tab

**Files:**
- Modify: the admin actions file (find via the grep in File Structure; assume `app/(app)/admin/clients/[tenantId]/actions.ts`)
- Modify: `app/(app)/admin/clients/[tenantId]/page.tsx`

- [ ] **Step 1: Add the server action**

In the same file as `setOpportunityStatusAction`, mirror it:

```typescript
export async function setWorkflowMapStatusAction(
  tenantId: string,
  workflowMapId: string,
  status: "provisional" | "surfaced" | "hidden",
): Promise<void> {
  const api = await getApi();
  await api.twistag.workflowMapSetStatus({ workflowMapId, status });
  revalidatePath(`/admin/clients/${tenantId}`);
}
```

> Match this file's existing imports for `getApi` and `revalidatePath` (the same ones `setOpportunityStatusAction` uses). Keep `"use server"` at the top of the file.

- [ ] **Step 2: Fetch curation maps + render a "Workflows" tab in `page.tsx`**

Add imports:

```typescript
import { WorkflowCurationCard } from "@/components/admin/WorkflowCurationCard";
import { setWorkflowMapStatusAction } from "./actions";
```

After the existing fetches, add:

```typescript
  const workflowMaps = await api.twistag
    .workflowMapsForCuration({ tenantId })
    .catch(() => []);
  const onSetWorkflowStatus = setWorkflowMapStatusAction.bind(null, tenantId);
```

Add a new tab object to the tabs array (next to the `"opportunities"` tab):

```typescript
    {
      id: "workflows",
      label: "Workflow maps",
      content:
        workflowMaps.length === 0 ? (
          <EmptyState>
            No workflow maps yet. They generate from captures when a sprint is
            recomputed, then appear here as provisional for you to verify and
            surface. Tenants only ever see surfaced maps.
          </EmptyState>
        ) : (
          <div className="space-y-3">
            {workflowMaps.map((m) => (
              <WorkflowCurationCard
                key={m.id}
                map={m}
                onSetStatus={onSetWorkflowStatus}
              />
            ))}
            <p className="px-1 pt-1 text-xs text-text-3">
              Verify each diagram against its evidence before surfacing —
              surfacing is what makes it visible to the client. Twistag-only.
            </p>
          </div>
        ),
    },
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (`EmptyState` is already imported on this page — it's used by the opportunities tab.)

- [ ] **Step 4: Verify in the browser (preview)**

Start the dev server, sign in as Twistag (dev sign-in), open `/admin/clients/<tenantId>` for a tenant whose sprint has been recomputed (Plan 1) so provisional maps exist. Open the "Workflow maps" tab: confirm a card renders a diagram preview + confidence + status buttons; click **Surfaced**; reload the client report as the tenant and confirm the map now appears in "How the work flows today". `preview_screenshot` both.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/admin/clients/[tenantId]/actions.ts" "app/(app)/admin/clients/[tenantId]/page.tsx"
git commit -m "feat(admin): workflow maps curation tab"
```

---

## Task 5: Before/after generation (LLM) + linkage

**Files:**
- Create: `services/synthesis/workflows/before-after.ts`
- Create: `services/synthesis/workflows/before-after.test.ts`

- [ ] **Step 1: Write the failing test `before-after.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const completeStructured = vi.fn();
vi.mock("@/services/llm/client", () => ({
  completeStructured: (...a: unknown[]) => completeStructured(...a),
}));

import {
  pickWorkflowForOpportunity,
  generateFutureState,
  buildBeforeAfter,
} from "./before-after";
import type { WorkflowGraph, WorkflowCapture } from "./types";

const C1 = "11111111-1111-4111-8111-111111111111";
const C2 = "22222222-2222-4222-8222-222222222222";

function graph(captureIds: string[]): WorkflowGraph {
  return {
    kind: "swimlane",
    title: "Deal to order",
    lanes: [{ id: "l1", roleLabel: "Ops", department: null }],
    steps: [
      { id: "s1", label: "Re-key", laneId: "l1", stepKind: "bottleneck", inferred: false, captureIds, metric: null },
    ],
    edges: [],
    confidence: { score: 0.8, coverage: 1, corroboratedCount: 1, disputedStepIds: [] },
    modelVersion: "m",
  };
}

beforeEach(() => completeStructured.mockReset());

describe("pickWorkflowForOpportunity", () => {
  it("picks the swimlane map with the most capture overlap", () => {
    const maps = [
      { id: "a", graph: graph([C1]) },
      { id: "b", graph: graph([C1, C2]) },
    ];
    const picked = pickWorkflowForOpportunity(new Set([C1, C2]), maps);
    expect(picked?.id).toBe("b");
  });
  it("returns null when nothing overlaps", () => {
    const maps = [{ id: "a", graph: graph([C1]) }];
    expect(pickWorkflowForOpportunity(new Set(["zzz"]), maps)).toBeNull();
  });
});

describe("generateFutureState", () => {
  it("forces swimlane kind and validates: new steps must be inferred", async () => {
    completeStructured.mockResolvedValue({
      kind: "swimlane",
      title: "Future",
      lanes: [{ id: "l1", roleLabel: "Ops", department: null }],
      steps: [
        { id: "s1", label: "Auto-sync", laneId: "l1", stepKind: "step", inferred: true, captureIds: [] },
        { id: "s2", label: "Ghost", laneId: "l1", stepKind: "step", inferred: false, captureIds: ["bad"] },
      ],
      edges: [],
    });
    const future = await generateFutureState(graph([C1]), { title: "Automate", description: "x" }, [], new Set([C1]));
    expect(future?.kind).toBe("swimlane");
    // s2 had a fabricated id and wasn't inferred → dropped by validation.
    expect(future?.steps.map((s) => s.id)).toEqual(["s1"]);
  });
});

describe("buildBeforeAfter", () => {
  it("wraps before + after into a before_after graph", () => {
    const future = { kind: "swimlane" as const, title: "Future", lanes: [], steps: [{ id: "s1", label: "Auto", laneId: null, stepKind: "step" as const, inferred: true, captureIds: [], metric: null }], edges: [] };
    const caps: WorkflowCapture[] = [{ id: C1, kind: "bottleneck", summary: "x", role: "Ops", department: null, contributorId: "u1" }];
    const ba = buildBeforeAfter(graph([C1]), future, caps, "m");
    expect(ba.kind).toBe("before_after");
    expect(ba.before.steps[0].id).toBe("s1");
    expect(ba.after.confidence).toBeDefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run services/synthesis/workflows/before-after.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `before-after.ts`**

```typescript
import { completeStructured } from "@/services/llm/client";
import {
  workflowGraphDraft,
  type WorkflowGraphDraft,
} from "@/services/llm/schemas";
import { validateGraph } from "./validate";
import { scoreConfidence } from "./confidence";
import type {
  BeforeAfterGraph,
  WorkflowCapture,
  WorkflowGraph,
} from "./types";

/** Pick the swimlane map whose steps/edges share the most captures with an opportunity. */
export function pickWorkflowForOpportunity(
  oppCaptureIds: Set<string>,
  maps: { id: string; graph: WorkflowGraph }[],
): { id: string; graph: WorkflowGraph } | null {
  let best: { id: string; graph: WorkflowGraph } | null = null;
  let bestOverlap = 0;
  for (const m of maps) {
    if (m.graph.kind !== "swimlane") continue;
    const ids = new Set<string>();
    for (const s of m.graph.steps) for (const id of s.captureIds) ids.add(id);
    for (const e of m.graph.edges) for (const id of e.captureIds) ids.add(id);
    let overlap = 0;
    for (const id of ids) if (oppCaptureIds.has(id)) overlap++;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = m;
    }
  }
  return bestOverlap > 0 ? best : null;
}

function futureSystem(): string {
  return [
    "You are given a current-state swimlane and an improvement. Produce the",
    "FUTURE-STATE swimlane after the improvement ships.",
    "",
    "RULES:",
    "1. Keep the steps that still happen, citing the SAME captureIds they had.",
    "2. Remove the bottleneck/handoff the improvement eliminates.",
    "3. Any NEW or automated step you add is a PROPOSAL, not something observed:",
    "   set inferred=true and leave its captureIds empty. Never attach a",
    "   captureId to a step that didn't exist in the current state.",
    "4. Use only the existing lane roleLabels. No names. Plain words.",
    "",
    "Return JSON matching the workflow graph schema with kind='swimlane'.",
  ].join("\n");
}

function serializeGraph(g: WorkflowGraph): string {
  const lanes = g.lanes.map((l) => `LANE ${l.id}: ${l.roleLabel}`).join("\n");
  const steps = g.steps
    .map((s) => `STEP ${s.id} (lane=${s.laneId ?? "-"}, ${s.stepKind}): "${s.label}" captures=[${s.captureIds.join(",")}]`)
    .join("\n");
  const edges = g.edges
    .map((e) => `EDGE ${e.id}: ${e.from}->${e.to} (${e.edgeKind})`)
    .join("\n");
  return [lanes, "", steps, "", edges].join("\n");
}

/**
 * Generate the future-state swimlane for an opportunity. Validates against the
 * current graph's captureIds, so kept steps stay grounded and any invented
 * citation is dropped (a genuinely new step must be inferred). Returns null on
 * LLM failure (caller treats it as "no before/after").
 */
export async function generateFutureState(
  current: WorkflowGraph,
  opp: { title: string; description: string },
  roleLabels: string[],
  knownCaptureIds: Set<string>,
): Promise<WorkflowGraphDraft | null> {
  let draft: WorkflowGraphDraft;
  try {
    draft = await completeStructured({
      system: futureSystem(),
      schema: workflowGraphDraft,
      maxTokens: 3072,
      messages: [
        {
          role: "user",
          content: [
            `IMPROVEMENT: ${opp.title} — ${opp.description}`,
            `ALLOWED LANE ROLES: ${roleLabels.join(", ") || "(use the current lanes)"}`,
            "",
            "CURRENT STATE:",
            serializeGraph(current),
          ].join("\n"),
        },
      ],
    });
  } catch {
    return null;
  }
  const validated = validateGraph({ ...draft, kind: "swimlane" }, knownCaptureIds);
  return validated.steps.length > 0 ? validated : null;
}

/** Wrap a current graph + a validated future draft into a stored before/after. */
export function buildBeforeAfter(
  before: WorkflowGraph,
  future: WorkflowGraphDraft,
  captures: WorkflowCapture[],
  modelVersion: string,
): BeforeAfterGraph {
  const scored = scoreConfidence(future, captures);
  const after: WorkflowGraph = {
    ...future,
    confidence: { ...scored, disputedStepIds: [] },
    modelVersion,
  };
  return {
    kind: "before_after",
    title: `${before.title} — before & after`,
    before,
    after,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run services/synthesis/workflows/before-after.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add services/synthesis/workflows/before-after.ts services/synthesis/workflows/before-after.test.ts
git commit -m "feat(workflows): before/after future-state generation + linkage"
```

---

## Task 6: `buildBeforeAfterMaps` + recompute wiring

**Files:**
- Modify: `services/opportunity/recompute.ts`

- [ ] **Step 1: Add imports + `buildBeforeAfterMaps`**

Add imports:

```typescript
import {
  pickWorkflowForOpportunity,
  generateFutureState,
  buildBeforeAfter,
} from "@/services/synthesis/workflows/before-after";
import type { WorkflowGraph } from "@/services/synthesis/workflows/types";
```

Add the function next to `buildWorkflowMaps`:

```typescript
/**
 * Generate before/after diagrams for portfolio opportunities (Plan 3, feature
 * D). For each opportunity, link to the swimlane map it overlaps and generate
 * an honest future-state (new steps inferred). Idempotent on provisional rows;
 * curated/surfaced before/after rows are preserved. Best-effort.
 */
async function buildBeforeAfterMaps(
  tx: Db,
  opts: {
    tenantId: string;
    sprintId: string;
    portfolioOpps: { id: string; title: string; description: string; captureIds: string[] }[];
    captures: WorkflowCapture[];
    roleLabels: string[];
    modelVersion: string;
  },
): Promise<void> {
  if (opts.portfolioOpps.length === 0) return;

  // The swimlane maps just written by buildWorkflowMaps (same transaction).
  const mapRows = await tx
    .select({ id: workflowMaps.id, graph: workflowMaps.graph })
    .from(workflowMaps)
    .where(
      and(
        eq(workflowMaps.sprintId, opts.sprintId),
        eq(workflowMaps.kind, "swimlane"),
      ),
    );
  const maps = mapRows.map((r) => ({ id: r.id, graph: r.graph as WorkflowGraph }));
  if (maps.length === 0) return;

  // Replace provisional before/after rows only.
  await tx
    .delete(workflowMaps)
    .where(
      and(
        eq(workflowMaps.sprintId, opts.sprintId),
        eq(workflowMaps.kind, "before_after"),
        eq(workflowMaps.status, "provisional"),
      ),
    );

  const known = new Set(opts.captures.map((c) => c.id));
  for (const opp of opts.portfolioOpps) {
    const picked = pickWorkflowForOpportunity(new Set(opp.captureIds), maps);
    if (!picked) continue;
    const future = await generateFutureState(
      picked.graph,
      { title: opp.title, description: opp.description },
      opts.roleLabels,
      known,
    );
    if (!future) continue;
    const graph = buildBeforeAfter(picked.graph, future, opts.captures, opts.modelVersion);
    await tx.insert(workflowMaps).values({
      tenantId: opts.tenantId,
      sprintId: opts.sprintId,
      kind: "before_after",
      graph,
      status: "provisional",
      opportunityId: opp.id,
    });
  }
}
```

- [ ] **Step 2: Refactor the call site to share inputs + add the before/after pass**

Replace the `buildWorkflowMaps(tx, { … })` call that Plan 1 added with this block (extracts the shared inputs, then runs both passes; place it after `buildPortfolio`):

```typescript
  // --- workflow diagram maps (Plan 1) + before/after (Plan 3) ---------------
  const wfCaptures: WorkflowCapture[] = captureRows.map((c) => ({
    id: c.id,
    kind: c.kind,
    summary: c.summary,
    role: c.title ?? "",
    department: c.department ?? null,
    contributorId: c.userId,
  }));
  const wfRoleLabels = [
    ...new Set(captureRows.map((c) => c.title).filter((t): t is string => Boolean(t))),
  ];
  const wfModelVersion = `${process.env.ATLAS_LLM_MODEL ?? "claude-sonnet-4-6"}:wf-v1`;
  const wfOpportunities = finalCandidates
    .filter((c) => surfacedKeys.has(c.key) && idByKey.has(c.key))
    .map((c) => ({
      id: idByKey.get(c.key) as string,
      title: c.title,
      impactHigh: c.impactHigh,
      timeToShipWeeksHigh: c.timeToShipWeeksHigh,
      horizon: c.horizon,
    }));

  await buildWorkflowMaps(tx, {
    tenantId,
    sprintId,
    captures: wfCaptures,
    opportunities: wfOpportunities,
    roleLabels: wfRoleLabels,
  });

  await buildBeforeAfterMaps(tx, {
    tenantId,
    sprintId,
    portfolioOpps: finalCandidates
      .filter((c) => surfacedKeys.has(c.key) && idByKey.has(c.key))
      .map((c) => ({
        id: idByKey.get(c.key) as string,
        title: c.title,
        description: c.description,
        captureIds: c.evidenceCaptureIds,
      })),
    captures: wfCaptures,
    roleLabels: wfRoleLabels,
    modelVersion: wfModelVersion,
  });
```

> `buildWorkflowMaps` (Plan 1) computes its own `modelVersion` internally — that's fine; `wfModelVersion` here is for the before/after pass. If you prefer, thread `wfModelVersion` into `buildWorkflowMaps` too. `c.description` and `c.evidenceCaptureIds` come from the same `finalCandidates` entries Plan 1 already maps for the portfolio; confirm those fields exist on the candidate (they do — `evidenceCaptureIds` is used by `replaceEvidence`, `description` by the opportunity insert).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add services/opportunity/recompute.ts
git commit -m "feat(recompute): generate before/after maps for portfolio opportunities"
```

---

## Task 7: Read + tRPC for opportunity before/after

**Files:**
- Modify: `lib/sprint-read.ts`
- Modify: `server/trpc/routers/opportunity.ts`
- Modify: `db/workflow-maps.integration.test.ts`

- [ ] **Step 1: Write the failing read test (append to `db/workflow-maps.integration.test.ts`)**

```typescript
import { loadOpportunityWorkflow } from "@/lib/sprint-read";

describe("loadOpportunityWorkflow", () => {
  const OPP_ID = "00000000-0000-0000-0000-0000000009f1";
  const baGraph = {
    kind: "before_after",
    title: "Deal to order — before & after",
    before: { ...sampleGraph, title: "before" },
    after: { ...sampleGraph, title: "after" },
  };

  it("returns the surfaced before/after for an opportunity", async () => {
    await seedRow((tx) =>
      tx.insert(workflowMaps).values({
        tenantId: TENANT_A,
        sprintId: SPRINT_A,
        kind: "before_after",
        status: "surfaced",
        opportunityId: OPP_ID,
        graph: baGraph,
      }),
    );
    const view = await asUser({ tenantId: TENANT_A }, (tx) =>
      loadOpportunityWorkflow(tx, OPP_ID),
    );
    expect(view).not.toBeNull();
    expect(view!.before.title).toBe("before");
    expect(view!.after.title).toBe("after");
  });

  it("returns null when no before/after exists", async () => {
    const view = await asUser({ tenantId: TENANT_A }, (tx) =>
      loadOpportunityWorkflow(tx, "00000000-0000-0000-0000-0000000009f2"),
    );
    expect(view).toBeNull();
  });
});
```

> This block seeds a `before_after` row whose `opportunityId` references `OPP_ID`. The `workflow_maps.opportunity_id` FK is to `opportunities(id)` — seed a matching opportunity first (service role) or, simpler for this isolation test, drop the FK requirement by seeding an opportunity row with `id = OPP_ID` (tenant A, sprint A, the required NOT NULL columns from `db/schema.ts`). Use `seedRow` to insert it before the map.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run -c vitest.integration.config.ts db/workflow-maps.integration.test.ts`
Expected: FAIL (`loadOpportunityWorkflow` not exported).

- [ ] **Step 3: Add `loadOpportunityWorkflow` to `lib/sprint-read.ts`**

```typescript
/**
 * The before/after workflow for an opportunity, or null. Under a tenant context
 * RLS returns it only when surfaced. The graph holds two swimlane graphs.
 */
export async function loadOpportunityWorkflow(
  tx: Db,
  opportunityId: string,
): Promise<OpportunityWorkflowView | null> {
  const [row] = await tx
    .select({ id: workflowMaps.id, graph: workflowMaps.graph })
    .from(workflowMaps)
    .where(
      and(
        eq(workflowMaps.opportunityId, opportunityId),
        eq(workflowMaps.kind, "before_after"),
      ),
    )
    .limit(1);
  if (!row) return null;
  const ba = row.graph as BeforeAfterGraph;
  return { id: row.id, title: ba.title, before: ba.before, after: ba.after };
}
```

- [ ] **Step 4: Add the tRPC query to `server/trpc/routers/opportunity.ts`**

Add `loadOpportunityWorkflow` to the `@/lib/sprint-read` import and:

```typescript
  workflow: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) =>
      withTenantContext(ctx.session, (tx) =>
        loadOpportunityWorkflow(tx, input.id),
      ),
    ),
```

- [ ] **Step 5: Run + typecheck**

Run: `npx vitest run -c vitest.integration.config.ts db/workflow-maps.integration.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/sprint-read.ts server/trpc/routers/opportunity.ts db/workflow-maps.integration.test.ts
git commit -m "feat(opportunity): loadOpportunityWorkflow + workflow query"
```

---

## Task 8: Render before/after on the opportunity page

**Files:**
- Create: `components/workflow/BeforeAfterView.tsx`
- Create: `components/workflow/BeforeAfterView.test.tsx`
- Modify: `components/opportunity/OpportunityDetail.tsx`
- Modify: `app/(app)/sprint/[id]/opportunity/[oppId]/page.tsx`

- [ ] **Step 1: Write the failing test `BeforeAfterView.test.tsx`**

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BeforeAfterView } from "./BeforeAfterView";
import type { OpportunityWorkflowView } from "@/services/synthesis/workflows/types";

const wf: OpportunityWorkflowView = {
  id: "wm1",
  title: "Deal to order — before & after",
  before: { kind: "swimlane", title: "before", lanes: [], steps: [{ id: "s1", label: "Re-key", laneId: null, stepKind: "bottleneck", inferred: false, captureIds: [], metric: null }], edges: [], confidence: { score: 0.8, coverage: 1, corroboratedCount: 1, disputedStepIds: [] }, modelVersion: "m" },
  after: { kind: "swimlane", title: "after", lanes: [], steps: [{ id: "s1", label: "Auto-sync", laneId: null, stepKind: "step", inferred: true, captureIds: [], metric: null }], edges: [], confidence: { score: 0.5, coverage: 0, corroboratedCount: 0, disputedStepIds: [] }, modelVersion: "m" },
};

describe("BeforeAfterView", () => {
  it("renders two diagrams labelled Before and After", () => {
    render(<BeforeAfterView workflow={wf} />);
    expect(screen.getByText("Before")).toBeTruthy();
    expect(screen.getByText("After")).toBeTruthy();
    expect(document.querySelectorAll("svg").length).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/workflow/BeforeAfterView.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `BeforeAfterView.tsx`**

```typescript
import { WorkflowDiagram } from "./WorkflowDiagram";
import type { OpportunityWorkflowView } from "@/services/synthesis/workflows/types";

/**
 * Current vs. proposed workflow for an opportunity. Two stacked swimlanes; the
 * "after" is a proposal — its new/automated steps render dashed (inferred).
 */
export function BeforeAfterView({
  workflow,
}: {
  workflow: OpportunityWorkflowView;
}) {
  return (
    <div className="space-y-6">
      <p className="text-[13px] text-text-3">
        Synthesized current state vs. the proposed future. Dashed steps in the
        future view are proposed, not yet observed.
      </p>
      {(
        [
          ["Before", workflow.before],
          ["After", workflow.after],
        ] as const
      ).map(([label, graph]) => (
        <figure
          key={label}
          className="overflow-x-auto rounded-lg border border-border bg-surface p-3"
        >
          <figcaption className="mb-2 text-xs font-medium uppercase tracking-wide text-text-3">
            {label}
          </figcaption>
          <WorkflowDiagram graph={graph} />
        </figure>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/workflow/BeforeAfterView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add the "Before / after" tab to `OpportunityDetail.tsx`**

Make four edits:

1. Widen the `Tab` type:

```typescript
type Tab = "evidence" | "workflow" | "patterns" | "discussion";
```

2. Add a `workflow` prop (interface + destructure):

```typescript
  workflow,
```
```typescript
  /** Before/after workflow for this opportunity, when one has been surfaced. */
  workflow?: OpportunityWorkflowView | null;
```

and the import:

```typescript
import { BeforeAfterView } from "@/components/workflow/BeforeAfterView";
import type { OpportunityWorkflowView } from "@/services/synthesis/workflows/types";
```

3. Make the tab list dynamic (replace the hardcoded `tabKeys` and the inline `[Tab, string][]` array):

```typescript
  const tabKeys: Tab[] = workflow
    ? ["evidence", "workflow", "patterns", "discussion"]
    : ["evidence", "patterns", "discussion"];
```

```typescript
            {(
              [
                ["evidence", `Evidence · ${opp.evidence.length}`],
                ...(workflow ? ([["workflow", "Before / after"]] as [Tab, string][]) : []),
                ["patterns", "Patterns"],
                ["discussion", "Discussion"],
              ] as [Tab, string][]
            ).map(([key, label], idx) => {
```

4. Add the panel (next to the `{tab === "evidence" && (…)}` block):

```typescript
          {tab === "workflow" && workflow && (
            <div
              role="tabpanel"
              id={panelId("workflow")}
              aria-labelledby={tabId("workflow")}
              tabIndex={0}
            >
              <BeforeAfterView workflow={workflow} />
            </div>
          )}
```

- [ ] **Step 6: Fetch + pass `workflow` from the opportunity page**

In `app/(app)/sprint/[id]/opportunity/[oppId]/page.tsx`, extend the fetch and pass the prop:

```typescript
  const [opp, sprint, workflow] = await Promise.all([
    api.opportunity.get({ id: oppId }).catch(() => null),
    api.sprint.get({ id }).catch(() => null),
    api.opportunity.workflow({ id: oppId }).catch(() => null),
  ]);
  if (!opp) notFound();

  return (
    <OpportunityDetail
      sprintId={id}
      opp={opp}
      sow={buildSowDraft(opp, sprint?.tenantName ?? "your organization")}
      approverRole={session.role}
      onApprove={approveOpportunity}
      currency={sprint?.tenantCurrency ?? "EUR"}
      workflow={workflow}
    />
  );
```

- [ ] **Step 7: Typecheck + full workflow suite**

Run: `npx tsc --noEmit && npx vitest run components/workflow services/synthesis/workflows`
Expected: PASS.

- [ ] **Step 8: Verify in the browser (preview)**

Recompute a sprint (Plan 1) so a `before_after` row generates for a portfolio opportunity, surface it via the curation tab (Task 4), then open that opportunity's detail page as the manager/sponsor. Confirm a "Before / after" tab appears and renders two swimlanes with the future-state's new step dashed. `preview_screenshot`.

- [ ] **Step 9: Commit**

```bash
git add components/workflow/BeforeAfterView.tsx components/workflow/BeforeAfterView.test.tsx components/opportunity/OpportunityDetail.tsx "app/(app)/sprint/[id]/opportunity/[oppId]/page.tsx"
git commit -m "feat(opportunity): before/after workflow tab"
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- §8.7 human-curated gate → Tasks 1–4: `setWorkflowMapStatus` (service-role, audited) + `workflowMapSetStatus` procedure + `WorkflowCurationCard` + admin "Workflow maps" tab. Tenant RLS (Plan 1) = surfaced-only, so surfacing in the card is the only path to client visibility.
- Feature D (before/after) → Tasks 5–8: linkage by capture overlap (`pickWorkflowForOpportunity`), honest future-state generation (new steps forced `inferred`, validated against current captureIds), stored as one `before_after` row, rendered as two `WorkflowDiagram`s.
- §11 privacy: future-state generation sends the current graph (labels + capture ids) + opportunity title/description; never names/contributorId. Evidence stays name+role at read. Curation reads run under `withTwistagContext` (audited cross-tenant), writes under `withServiceRole` (audited), exactly like opportunity curation.

**Placeholder scan:** none. The "find the actions file" and "seed an opportunity for the FK" notes are concrete instructions guarded by a grep / explicit column requirements, not vague directives.

**Type consistency:** `BeforeAfterGraph`, `WorkflowCurationRow`, `OpportunityWorkflowView` defined once (Task 2) and consumed by Tasks 3–8. `setWorkflowMapStatus(actor, tenantId, id, status)` matches between lib, the procedure, and the test. `generateFutureState` / `buildBeforeAfter` / `pickWorkflowForOpportunity` signatures match between `before-after.ts`, its test, and `recompute.ts`. The `before_after` row shape (`{ kind, title, before, after }`) is written by `buildBeforeAfter`/`buildBeforeAfterMaps`, previewed by `loadWorkflowMapsForCuration` (`.after`), and read by `loadOpportunityWorkflow` — all consistent. `WorkflowDiagram` returns null for `before_after` (Plan 2), which is correct: before/after is always rendered via `BeforeAfterView` (two swimlane graphs), never passed to `WorkflowDiagram` directly.

**Cross-plan dependencies:** requires Plans 1 & 2 merged. Amends Plan 2's `loadWorkflowMaps` to exclude `opportunityId`-scoped rows (done in the Plan 2 doc). The recompute call site here **replaces** the inline `buildWorkflowMaps` call Plan 1 added (Task 6 Step 2).
