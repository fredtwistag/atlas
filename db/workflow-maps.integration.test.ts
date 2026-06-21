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
