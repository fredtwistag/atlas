import { describe, it, expect, beforeEach } from "vitest";
import { eq, and } from "drizzle-orm";
import { sprints, opportunities, auditLog } from "./schema";
import {
  seedRow,
  resetDb,
  seedTenants,
  withServiceRoleRaw,
  TENANT_A,
} from "./test/helpers";
import {
  updateOpportunity,
  setOpportunityStatus,
} from "@/lib/twistag-admin";

/**
 * Plan 016 Step 6 — curation mutation integration tests. These exercise the
 * service-role + audit path against embedded-postgres: edit fields, move
 * status, and the approved-row guard. Authorization (twistag kind) is enforced
 * upstream and not retested here.
 */

const SPRINT = "ee111111-1111-4111-8111-111111111111";
const OPP = "ff111111-1111-4111-8111-111111111111";
const APPROVED_OPP = "ff222222-2222-4222-8222-222222222222";
const ACTOR = { userId: "00000000-0000-4000-8000-0000000000ff", twistagRole: "twistag_admin" };

function sprintRow() {
  return {
    id: SPRINT,
    tenantId: TENANT_A,
    name: "S",
    primaryFocus: "ops",
    startDate: "2026-05-18",
    endDate: "2026-06-12",
    cadence: "weekly",
    status: "active",
  };
}

function oppRow(over: Record<string, unknown> = {}) {
  return {
    id: OPP,
    tenantId: TENANT_A,
    sprintId: SPRINT,
    title: "Original title here",
    description: "Original description",
    category: "Ops",
    impactLow: 50_000,
    impactHigh: 150_000,
    timeToShipWeeksLow: 3,
    timeToShipWeeksHigh: 4,
    confidenceScore: 4,
    compositeScore: "7.3",
    dimensionScores: [],
    rationale: "Original rationale text",
    status: "surfaced",
    ...over,
  };
}

beforeEach(async () => {
  await resetDb();
  await seedTenants();
  await seedRow((tx) => tx.insert(sprints).values(sprintRow()));
  await seedRow((tx) => tx.insert(opportunities).values(oppRow()));
  await seedRow((tx) =>
    tx.insert(opportunities).values(
      oppRow({
        id: APPROVED_OPP,
        title: "Approved opportunity",
        status: "approved",
      }),
    ),
  );
});

async function read(id: string) {
  const [row] = await withServiceRoleRaw((tx) =>
    tx.select().from(opportunities).where(eq(opportunities.id, id)),
  );
  return row;
}

describe("updateOpportunity", () => {
  it("edits curatable fields and writes an audit row", async () => {
    await updateOpportunity(ACTOR, TENANT_A, OPP, {
      title: "Curated better title",
      rationale: "A sharper, human-reviewed rationale.",
      impactLow: 100_000,
      impactHigh: 300_000,
    });

    const row = await read(OPP);
    expect(row.title).toBe("Curated better title");
    expect(row.rationale).toBe("A sharper, human-reviewed rationale.");
    expect(row.impactLow).toBe(100_000);
    expect(row.impactHigh).toBe(300_000);

    const audit = await withServiceRoleRaw((tx) =>
      tx
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "twistag.opportunity.update")),
    );
    expect(audit).toHaveLength(1);
    expect(audit[0].targetId).toBe(OPP);
  });

  it("refuses to edit an approved opportunity", async () => {
    await expect(
      updateOpportunity(ACTOR, TENANT_A, APPROVED_OPP, {
        title: "Trying to tamper",
      }),
    ).rejects.toThrow(/approved/i);

    const row = await read(APPROVED_OPP);
    expect(row.title).toBe("Approved opportunity");
  });

  it("rejects an inverted impact range (resolved against current values)", async () => {
    await expect(
      updateOpportunity(ACTOR, TENANT_A, OPP, { impactLow: 999_999 }),
    ).rejects.toThrow(/impactLow/i);
  });
});

describe("setOpportunityStatus", () => {
  it("moves provisional/surfaced/hidden and audits", async () => {
    await setOpportunityStatus(ACTOR, TENANT_A, OPP, "hidden");
    expect((await read(OPP)).status).toBe("hidden");

    await setOpportunityStatus(ACTOR, TENANT_A, OPP, "surfaced");
    expect((await read(OPP)).status).toBe("surfaced");

    const audit = await withServiceRoleRaw((tx) =>
      tx
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "twistag.opportunity.status")),
    );
    expect(audit.length).toBe(2);
  });

  it("rejects an unknown/forbidden status (including approved)", async () => {
    await expect(
      setOpportunityStatus(ACTOR, TENANT_A, OPP, "approved"),
    ).rejects.toThrow(/invalid status/i);
  });

  it("refuses to change an approved opportunity", async () => {
    await expect(
      setOpportunityStatus(ACTOR, TENANT_A, APPROVED_OPP, "hidden"),
    ).rejects.toThrow(/approved/i);
    expect((await read(APPROVED_OPP)).status).toBe("approved");
  });

  it("does not cross tenants (wrong tenant id is a no-op not-found)", async () => {
    await expect(
      setOpportunityStatus(ACTOR, "00000000-0000-0000-0000-00000000000b", OPP, "hidden"),
    ).rejects.toThrow(/not found/i);
    expect((await read(OPP)).status).toBe("surfaced");
  });
});
