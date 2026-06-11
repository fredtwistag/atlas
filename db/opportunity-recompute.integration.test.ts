import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq, and } from "drizzle-orm";
import {
  sprints,
  sessions,
  captures,
  users,
  opportunities,
  opportunityEvidence,
  auditLog,
} from "./schema";
import {
  seedRow,
  resetDb,
  seedTenants,
  withServiceRoleRaw,
  TENANT_A,
} from "./test/helpers";

/**
 * Plan 016 Step 4 — recompute integration test (embedded-postgres).
 *
 * The LLM layer is mocked: `completeStructured` dispatches on the system prompt
 * (clustering prompt vs scoring prompt) so we drive deterministic clusters and
 * scores without a network call. Everything else — the SQL, the lifecycle, the
 * idempotency, the approved-row immutability — runs for real against Postgres.
 */

const completeStructured = vi.fn();
vi.mock("@/services/llm/client", () => ({
  completeStructured: (...args: unknown[]) => completeStructured(...args),
}));

// Import after the mock is registered.
import { recompute } from "@/services/opportunity/recompute";

const SPRINT = "aa111111-1111-4111-8111-111111111111";
const SESSION = "bb111111-1111-4111-8111-111111111111";
const U1 = "cc111111-1111-4111-8111-111111111111";
const U2 = "cc222222-2222-4222-8222-222222222222";
const CAP1 = "dd111111-1111-4111-8111-111111111111";
const CAP2 = "dd222222-2222-4222-8222-222222222222";
const CAP3 = "dd333333-3333-4333-8333-333333333333";

// A fixed clock so day-7 surfacing is deterministic. Sprint starts 2026-06-01;
// "now" is 2026-06-10 => day 9 (>= 7), so confident opportunities surface.
const START = "2026-06-01";
const NOW = new Date("2026-06-10T12:00:00Z").getTime();
const EARLY = new Date("2026-06-03T12:00:00Z").getTime(); // day 2 (< 7)

const ACTOR = "00000000-0000-4000-8000-0000000000ff";

function sprintRow() {
  return {
    id: SPRINT,
    tenantId: TENANT_A,
    name: "Q2 Discovery",
    primaryFocus: "ops",
    startDate: START,
    endDate: "2026-06-26",
    cadence: "weekly",
    status: "active",
  };
}

async function seedCaptures() {
  await seedRow((tx) =>
    tx.insert(users).values([
      {
        id: U1,
        tenantId: TENANT_A,
        email: "ae@a.example",
        name: "Real Name One",
        role: "ic",
        title: "Account Executive",
        department: "Sales",
      },
      {
        id: U2,
        tenantId: TENANT_A,
        email: "ops@a.example",
        name: "Real Name Two",
        role: "ic",
        title: "Ops Lead",
        department: "Operations",
      },
    ]),
  );
  await seedRow((tx) =>
    tx.insert(sprints).values(sprintRow()),
  );
  await seedRow((tx) =>
    tx.insert(sessions).values({
      id: SESSION,
      tenantId: TENANT_A,
      sprintId: SPRINT,
      userId: U1,
      status: "completed",
    }),
  );
  await seedRow((tx) =>
    tx.insert(captures).values([
      {
        id: CAP1,
        tenantId: TENANT_A,
        sessionId: SESSION,
        userId: U1,
        kind: "bottleneck",
        summary: "Pricing approvals wait days for VP sign-off.",
        sourceQuote: "we wait days for pricing sign-off",
      },
      {
        id: CAP2,
        tenantId: TENANT_A,
        sessionId: SESSION,
        userId: U2,
        kind: "frustration",
        summary: "AEs ship list price when blocked, eroding margin.",
        sourceQuote: "when it's blocked we just ship list price",
      },
      {
        id: CAP3,
        tenantId: TENANT_A,
        sessionId: SESSION,
        userId: U1,
        kind: "workaround",
        summary: "AEs escalate on Slack to unblock pricing.",
        sourceQuote: "we ping finance on slack to unblock",
      },
    ]),
  );
}

/** Mock dispatcher: cluster call -> one theme of all 3 captures; score call -> a full scoring. */
function mockClusterAndScore(confidence = 4) {
  completeStructured.mockImplementation(async (opts: { system: string }) => {
    if (/cluster/i.test(opts.system)) {
      return {
        clusters: [
          { theme: "Pricing approval delay", captureIds: [CAP1, CAP2, CAP3] },
        ],
      };
    }
    // scoring
    return {
      title: "Automate pricing pre-approval",
      description:
        "Custom enterprise pricing waits days for VP sign-off; AEs ship list price.",
      category: "Pricing ops",
      departments: ["Sales", "Finance"],
      impactLow: 200_000,
      impactHigh: 500_000,
      timeToShipWeeksLow: 3,
      timeToShipWeeksHigh: 4,
      confidenceScore: confidence,
      dimensionScores: [
        { key: "financial", score: 8, reasoning: "x" },
        { key: "time_to_ship", score: 7, reasoning: "x" },
        { key: "ai_suitability", score: 6, reasoning: "x" },
        { key: "change_mgmt", score: 7, reasoning: "x" },
        { key: "dependency", score: 8, reasoning: "x" },
      ],
      rationale:
        "VP Sales gates custom pricing; quotes wait days. An Account Executive and an Ops Lead corroborate. Main uncertainty: share auto-routable. Recommended next step: Approve for FDE.",
      evidenceCaptureIds: [CAP1, CAP2, CAP3],
    };
  });
}

beforeEach(async () => {
  completeStructured.mockReset();
  await resetDb();
  await seedTenants();
  await seedCaptures();
});

describe("recompute — happy path + lifecycle", () => {
  it("inserts one surfaced opportunity with composite + evidence on day >= 7", async () => {
    mockClusterAndScore(4);

    const res = await recompute(SPRINT, ACTOR, { now: NOW });
    expect(res.inserted).toBe(1);
    expect(res.surfaced).toBe(1);

    const rows = await withServiceRoleRaw((tx) =>
      tx.select().from(opportunities).where(eq(opportunities.sprintId, SPRINT)),
    );
    expect(rows).toHaveLength(1);
    const opp = rows[0];
    expect(opp.status).toBe("surfaced");
    // 0.30*8+0.15*7+0.20*6+0.15*7+0.20*8 = 7.3
    expect(Number(opp.compositeScore)).toBe(7.3);
    expect(opp.contributorCount).toBe(2); // U1 + U2 across evidence
    expect(opp.rationale).not.toContain("Real Name");

    const ev = await withServiceRoleRaw((tx) =>
      tx
        .select()
        .from(opportunityEvidence)
        .where(eq(opportunityEvidence.opportunityId, opp.id)),
    );
    expect(ev).toHaveLength(3);
  });

  it("keeps the opportunity provisional before day 7", async () => {
    mockClusterAndScore(4);
    const res = await recompute(SPRINT, ACTOR, { now: EARLY });
    expect(res.surfaced).toBe(0);

    const rows = await withServiceRoleRaw((tx) =>
      tx.select().from(opportunities).where(eq(opportunities.sprintId, SPRINT)),
    );
    expect(rows[0].status).toBe("provisional");
  });

  it("keeps it provisional when confidence < 3 even past day 7", async () => {
    mockClusterAndScore(2);
    const res = await recompute(SPRINT, ACTOR, { now: NOW });
    expect(res.surfaced).toBe(0);

    const rows = await withServiceRoleRaw((tx) =>
      tx.select().from(opportunities).where(eq(opportunities.sprintId, SPRINT)),
    );
    expect(rows[0].status).toBe("provisional");
  });

  it("writes an audit row per run", async () => {
    mockClusterAndScore(4);
    await recompute(SPRINT, ACTOR, { now: NOW });
    const rows = await withServiceRoleRaw((tx) =>
      tx
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "opportunity.recompute")),
    );
    expect(rows.length).toBe(1);
    expect(rows[0].targetId).toBe(SPRINT);
  });
});

describe("recompute — idempotency + approved immutability", () => {
  it("running twice yields no duplicates (update in place by lowercase title)", async () => {
    mockClusterAndScore(4);
    await recompute(SPRINT, ACTOR, { now: NOW });
    const second = await recompute(SPRINT, ACTOR, { now: NOW });

    expect(second.inserted).toBe(0);
    expect(second.updated).toBe(1);

    const rows = await withServiceRoleRaw((tx) =>
      tx.select().from(opportunities).where(eq(opportunities.sprintId, SPRINT)),
    );
    expect(rows).toHaveLength(1);

    // Evidence replaced cleanly, not duplicated.
    const ev = await withServiceRoleRaw((tx) =>
      tx
        .select()
        .from(opportunityEvidence)
        .where(eq(opportunityEvidence.opportunityId, rows[0].id)),
    );
    expect(ev).toHaveLength(3);
  });

  it("never mutates an approved row", async () => {
    mockClusterAndScore(4);
    // First run creates the surfaced opportunity.
    await recompute(SPRINT, ACTOR, { now: NOW });
    const [created] = await withServiceRoleRaw((tx) =>
      tx.select().from(opportunities).where(eq(opportunities.sprintId, SPRINT)),
    );

    // Sponsor approves it (status -> approved, frozen).
    await withServiceRoleRaw((tx) =>
      tx
        .update(opportunities)
        .set({ status: "approved", title: "Approved — do not touch" })
        .where(eq(opportunities.id, created.id)),
    );

    // Recompute again — the cluster still maps to the same theme, but the
    // approved row's title changed so its key no longer matches; the engine
    // inserts a fresh provisional/surfaced row and leaves the approved one
    // untouched.
    const res = await recompute(SPRINT, ACTOR, { now: NOW });
    expect(res.skippedApproved).toBe(1);

    const approved = await withServiceRoleRaw((tx) =>
      tx
        .select()
        .from(opportunities)
        .where(
          and(
            eq(opportunities.id, created.id),
            eq(opportunities.status, "approved"),
          ),
        ),
    );
    expect(approved).toHaveLength(1);
    expect(approved[0].title).toBe("Approved — do not touch");
  });
});

describe("recompute — empty/thin sprints", () => {
  it("does nothing (no LLM call) when fewer than 2 captures exist", async () => {
    // Remove all but one capture.
    await withServiceRoleRaw((tx) =>
      tx
        .delete(captures)
        .where(
          and(eq(captures.sessionId, SESSION), eq(captures.userId, U2)),
        ),
    );
    await withServiceRoleRaw((tx) =>
      tx.delete(captures).where(eq(captures.id, CAP3)),
    );

    const res = await recompute(SPRINT, ACTOR, { now: NOW });
    expect(res.inserted).toBe(0);
    expect(res.clusters).toBe(0);
    expect(completeStructured).not.toHaveBeenCalled();
  });
});
