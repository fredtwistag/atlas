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
import { sprints, workflowMaps, users, captures, opportunities } from "./schema";
import { loadWorkflowMaps, loadOpportunityWorkflow } from "@/lib/sprint-read";
import { withTwistagContext } from "./client";

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

  it("a tenant user cannot insert a workflow map (service-role writes only)", async () => {
    await expect(
      asUser({ tenantId: TENANT_A }, (tx) =>
        tx.insert(workflowMaps).values({
          tenantId: TENANT_A,
          sprintId: SPRINT_A,
          kind: "swimlane",
          graph: sampleGraph,
          status: "provisional",
        }),
      ),
    ).rejects.toThrow();
  });

  it("a Twistag admin reads a provisional map the tenant cannot", async () => {
    await seedRow((tx) =>
      tx.insert(workflowMaps).values({
        tenantId: TENANT_A,
        sprintId: SPRINT_A,
        kind: "swimlane",
        graph: sampleGraph,
        status: "provisional",
      }),
    );

    const tenantRows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(workflowMaps),
    );
    expect(tenantRows).toHaveLength(0);

    const adminRows = await withTwistagContext(
      {
        twistagRole: "twistag_admin",
        actor: "00000000-0000-4000-8000-0000000000ff",
      },
      (tx) => tx.select().from(workflowMaps),
    );
    expect(adminRows.length).toBeGreaterThanOrEqual(1);
  });
});

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

const USER_A1 = "00000000-0000-0000-0000-0000000000a1";
const CAP_1 = "00000000-0000-0000-0000-0000000000c1";

describe("loadWorkflowMaps", () => {
  it("returns surfaced maps with name+role-attributed evidence", async () => {
    await seedRow((tx) =>
      tx.insert(users).values({
        id: USER_A1,
        tenantId: TENANT_A,
        email: "rep@a.test",
        name: "Dana Rep",
        role: "ic",
        title: "Sales rep",
        department: "Sales",
      }),
    );
    await seedRow((tx) =>
      tx.insert(captures).values({
        id: CAP_1,
        tenantId: TENANT_A,
        userId: USER_A1,
        kind: "handoff",
        summary: "Sales emails the deal to ops",
        sourceQuote: "I just email it over",
      }),
    );
    await seedRow((tx) =>
      tx.insert(workflowMaps).values({
        tenantId: TENANT_A,
        sprintId: SPRINT_A,
        kind: "swimlane",
        status: "surfaced",
        graph: {
          kind: "swimlane",
          title: "Deal to order",
          lanes: [],
          steps: [{ id: "s1", label: "Log deal", laneId: null, stepKind: "step", inferred: false, captureIds: [CAP_1], metric: null }],
          edges: [],
          confidence: { score: 0.9, coverage: 1, corroboratedCount: 1, disputedStepIds: [] },
          modelVersion: "m",
        },
      }),
    );

    const maps = await asUser({ tenantId: TENANT_A, userId: USER_A1 }, (tx) =>
      loadWorkflowMaps(tx, SPRINT_A),
    );
    expect(maps).toHaveLength(1);
    expect(maps[0].evidence).toHaveLength(1);
    expect(maps[0].evidence[0].contributorName).toBe("Dana Rep");
    expect(maps[0].evidence[0].contributorRole).toBe("Sales rep");
  });
});

describe("loadOpportunityWorkflow", () => {
  const OPP = "00000000-0000-0000-0000-0000000007f1";
  it("returns the surfaced per-opportunity diagram with name+role evidence", async () => {
    await seedRow((tx) =>
      tx.insert(opportunities).values({
        id: OPP, tenantId: TENANT_A, sprintId: SPRINT_A, title: "Automate re-keying", description: "d", category: "Ops",
        impactLow: 1, impactHigh: 2, timeToShipWeeksLow: 1, timeToShipWeeksHigh: 2, confidenceScore: 4,
        compositeScore: "6.0", dimensionScores: [], rationale: "r", status: "surfaced",
      }),
    );
    await seedRow((tx) =>
      tx.insert(workflowMaps).values({
        tenantId: TENANT_A, sprintId: SPRINT_A, kind: "swimlane", status: "surfaced", opportunityId: OPP,
        graph: { ...sampleGraph, title: "Current state" },
      }),
    );
    const view = await asUser({ tenantId: TENANT_A }, (tx) => loadOpportunityWorkflow(tx, OPP));
    expect(view).not.toBeNull();
    expect(view!.title).toBe("Current state");
  });
  it("returns null when the opportunity has no surfaced diagram", async () => {
    const view = await asUser({ tenantId: TENANT_A }, (tx) => loadOpportunityWorkflow(tx, "00000000-0000-0000-0000-0000000007f2"));
    expect(view).toBeNull();
  });

  it("attaches a deduped evidence description to each step", async () => {
    const OPP = "00000000-0000-0000-0000-0000000007f3";
    const CAP_A = CAP_1; // seeded in loadWorkflowMaps suite; summary = "Sales emails the deal to ops"
    // Seed the user + capture so CAP_A is available in this test
    await seedRow((tx) =>
      tx.insert(users).values({
        id: USER_A1,
        tenantId: TENANT_A,
        email: "rep@a.test",
        name: "Dana Rep",
        role: "ic",
        title: "Sales rep",
        department: "Sales",
      }),
    );
    await seedRow((tx) =>
      tx.insert(captures).values({
        id: CAP_A,
        tenantId: TENANT_A,
        userId: USER_A1,
        kind: "handoff",
        summary: "Sales emails the deal to ops",
        sourceQuote: "I just email it over",
      }),
    );
    await seedRow((tx) =>
      tx.insert(opportunities).values({
        id: OPP, tenantId: TENANT_A, sprintId: SPRINT_A, title: "Automate re-keying", description: "d", category: "Ops",
        impactLow: 1, impactHigh: 2, timeToShipWeeksLow: 1, timeToShipWeeksHigh: 2, confidenceScore: 4,
        compositeScore: "6.0", dimensionScores: [], rationale: "r", status: "surfaced",
      }),
    );
    await seedRow((tx) =>
      tx.insert(workflowMaps).values({
        tenantId: TENANT_A, sprintId: SPRINT_A, kind: "swimlane", status: "surfaced", opportunityId: OPP,
        graph: {
          kind: "swimlane", title: "t",
          lanes: [{ id: "L1", roleLabel: "Ops", department: null }],
          steps: [
            { id: "s1", label: "Start", laneId: "L1", stepKind: "start", inferred: true, captureIds: [], metric: null },
            { id: "s2", label: "Reconcile", laneId: "L1", stepKind: "bottleneck", inferred: false, captureIds: [CAP_A], metric: null },
            { id: "s3", label: "Re-enter", laneId: "L1", stepKind: "bottleneck", inferred: false, captureIds: [CAP_A], metric: null },
          ],
          edges: [],
          confidence: { score: 0.6, coverage: 0.6, corroboratedCount: 1, disputedStepIds: [] },
          modelVersion: "test",
        },
      }),
    );
    const view = await asUser({ tenantId: TENANT_A }, (tx) => loadOpportunityWorkflow(tx, OPP));
    const byId = new Map(view!.graph.steps.map((s) => [s.id, s.detail]));
    expect(byId.get("s1")).toBeNull();                 // inferred → no description
    expect(byId.get("s2")).toBeTruthy();               // first cite → the summary
    expect(byId.get("s3")).toBeNull();                 // same capture as s2 → deduped
  });
});
