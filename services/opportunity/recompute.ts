import { eq, and } from "drizzle-orm";
import { withServiceRole, type Db } from "@/db/client";
import {
  sprints,
  tenants,
  sessions,
  captures,
  users,
  opportunities,
  opportunityEvidence,
} from "@/db/schema";
import { DIMENSION_LABELS, scoreCluster, type ScoreCapture } from "./score";
import { clusterCaptures } from "./cluster";
import type { DimensionScore } from "@/lib/types";

/**
 * Plan 016 Step 4 — recompute orchestration: captures → cluster → score →
 * upsert. Callable standalone (plan 020 wraps this in an Inngest job; the
 * twistag `opportunity.recompute` procedure and the admin button call it now).
 *
 * Runs as service_role (audited, tenant-scoped explicitly) because it reads
 * every contributor's captures across a sprint and writes opportunities — work
 * no single tenant JWT is scoped to do. This mirrors lib/twistag-admin.ts.
 *
 * Lifecycle (must match the dashboard copy in app/(app)/sprint/[id]/page.tsx):
 * - New rows insert `provisional`. They promote to `surfaced` only when the
 *   sprint is on day ≥ 7 AND confidence ≥ 3.
 * - Surfaced rows are capped at 10, ranked by compositeScore (CLAUDE.md
 *   calibration: 5-10 surfaced, 1-3 high-impact).
 * - Rows with status `approved` are NEVER touched — the sponsor acted on them.
 * - Idempotent: the stable cluster key is the lowercase title, so recompute
 *   twice yields no duplicates (an existing non-approved row with the same key
 *   is updated in place; evidence links are replaced).
 *
 * Privacy (CLAUDE.md): contributor names never enter scoring (role/department
 * only) and never enter rationale — the capture join selects users.title and
 * users.department, never the name column. The plan's privacy grep stays empty.
 */

const DAY = 86_400_000;
const SURFACE_CAP = 10;
const SURFACE_DAY = 7;
const SURFACE_MIN_CONFIDENCE = 3;

/** Stable idempotency key for a cluster's resulting opportunity. */
function clusterKey(title: string): string {
  return title.trim().toLowerCase();
}

/** Days elapsed since the sprint started (1-based, like loadSprint's dayOf). */
function sprintDay(startDate: string, now: number): number {
  const start = new Date(startDate + "T00:00:00Z").getTime();
  return Math.max(1, Math.round((now - start) / DAY));
}

export type RecomputeResult = {
  sprintId: string;
  capturesConsidered: number;
  clusters: number;
  scored: number;
  inserted: number;
  updated: number;
  surfaced: number;
  skippedApproved: number;
};

export type RecomputeOpts = {
  /** Injectable clock for deterministic lifecycle tests. Defaults to now. */
  now?: number;
};

/**
 * Recompute a sprint's opportunities from its current captures. `actor` is
 * recorded in the audit row only (attribution), never used for authorization —
 * the caller (twistag procedure / admin action) already gated on twistag kind.
 */
export async function recompute(
  sprintId: string,
  actor: string,
  opts: RecomputeOpts = {},
): Promise<RecomputeResult> {
  const now = opts.now ?? Date.now();
  return withServiceRole(
    { action: "opportunity.recompute", actor, targetId: sprintId },
    async (tx) => runRecompute(tx, sprintId, now),
  );
}

/** A scored candidate ready to persist, with its TS-computed composite. */
type Candidate = {
  key: string;
  title: string;
  description: string;
  category: string;
  departments: string[];
  impactLow: number;
  impactHigh: number;
  timeToShipWeeksLow: number;
  timeToShipWeeksHigh: number;
  confidenceScore: number;
  compositeScore: number;
  dimensionScores: DimensionScore[];
  rationale: string;
  evidenceCaptureIds: string[];
  contributorCount: number;
};

async function runRecompute(
  tx: Db,
  sprintId: string,
  now: number,
): Promise<RecomputeResult> {
  const [sprint] = await tx
    .select({
      id: sprints.id,
      tenantId: sprints.tenantId,
      startDate: sprints.startDate,
    })
    .from(sprints)
    .where(eq(sprints.id, sprintId));
  if (!sprint) throw new Error("sprint not found");
  const tenantId = sprint.tenantId;
  const day = sprintDay(sprint.startDate, now);

  const [tenant] = await tx
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  const tenantName = tenant?.name ?? "your organization";

  // Non-removed captures for this sprint, with role/department (NEVER name).
  // captures has no sprint_id; scope via sessions.sprintId.
  const captureRows = await tx
    .select({
      id: captures.id,
      userId: captures.userId,
      kind: captures.kind,
      summary: captures.summary,
      sourceQuote: captures.sourceQuote,
      role: users.title,
      department: users.department,
    })
    .from(captures)
    .innerJoin(sessions, eq(captures.sessionId, sessions.id))
    .innerJoin(users, eq(captures.userId, users.id))
    .where(and(eq(sessions.sprintId, sprintId), eq(captures.isRemoved, false)));

  const empty: RecomputeResult = {
    sprintId,
    capturesConsidered: captureRows.length,
    clusters: 0,
    scored: 0,
    inserted: 0,
    updated: 0,
    surfaced: 0,
    skippedApproved: 0,
  };
  if (captureRows.length < 2) {
    // Still recompute surfacing on whatever already exists (e.g. approved rows
    // unchanged; nothing to insert). Short-circuit the LLM passes.
    return empty;
  }

  const byId = new Map(captureRows.map((c) => [c.id, c]));

  // --- cluster -------------------------------------------------------------
  const clusters = await clusterCaptures(
    captureRows.map((c) => ({ id: c.id, kind: c.kind, summary: c.summary })),
  );

  // --- score ---------------------------------------------------------------
  const candidates: Candidate[] = [];
  for (const cluster of clusters) {
    const clusterCapturesData: ScoreCapture[] = cluster.captureIds
      .map((id) => byId.get(id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .map((c) => ({
        id: c.id,
        kind: c.kind,
        summary: c.summary,
        sourceQuote: c.sourceQuote,
        role: c.role ?? "Contributor",
        department: c.department,
      }));
    if (clusterCapturesData.length < 2) continue;

    const { scoring, composite } = await scoreCluster({
      theme: cluster.theme,
      tenantName,
      captures: clusterCapturesData,
    });

    const evidenceIds = scoring.evidenceCaptureIds.filter((id) => byId.has(id));
    const contributorCount = new Set(
      evidenceIds.map((id) => byId.get(id)!.userId),
    ).size;

    const dimensionScores: DimensionScore[] = scoring.dimensionScores.map(
      (d) => ({
        key: d.key,
        label: DIMENSION_LABELS[d.key],
        score: d.score,
        reasoning: d.reasoning,
      }),
    );

    candidates.push({
      key: clusterKey(scoring.title),
      title: scoring.title,
      description: scoring.description,
      category: scoring.category,
      departments: scoring.departments,
      impactLow: scoring.impactLow,
      impactHigh: scoring.impactHigh,
      timeToShipWeeksLow: scoring.timeToShipWeeksLow,
      timeToShipWeeksHigh: scoring.timeToShipWeeksHigh,
      confidenceScore: scoring.confidenceScore,
      compositeScore: composite,
      dimensionScores,
      rationale: scoring.rationale,
      evidenceCaptureIds: evidenceIds,
      contributorCount,
    });
  }

  // Collapse duplicate keys the model might produce in one run (keep highest
  // composite); guarantees idempotency holds within a single recompute too.
  const byKey = new Map<string, Candidate>();
  for (const c of candidates) {
    const prev = byKey.get(c.key);
    if (!prev || c.compositeScore > prev.compositeScore) byKey.set(c.key, c);
  }
  const finalCandidates = [...byKey.values()];

  // --- surfacing decision --------------------------------------------------
  // Eligible = day >= 7 AND confidence >= 3. Cap surfaced at 10 by composite.
  const eligible = finalCandidates
    .filter(
      (c) =>
        day >= SURFACE_DAY && c.confidenceScore >= SURFACE_MIN_CONFIDENCE,
    )
    .sort((a, b) => b.compositeScore - a.compositeScore);
  const surfacedKeys = new Set(
    eligible.slice(0, SURFACE_CAP).map((c) => c.key),
  );

  // --- persist -------------------------------------------------------------
  // Existing non-approved rows for this sprint, keyed by lowercase title.
  const existing = await tx
    .select({
      id: opportunities.id,
      title: opportunities.title,
      status: opportunities.status,
    })
    .from(opportunities)
    .where(eq(opportunities.sprintId, sprintId));

  const existingByKey = new Map<
    string,
    { id: string; status: string }
  >();
  let skippedApproved = 0;
  for (const row of existing) {
    if (row.status === "approved") {
      skippedApproved++;
      continue; // NEVER touch approved rows.
    }
    existingByKey.set(clusterKey(row.title), {
      id: row.id,
      status: row.status,
    });
  }

  let inserted = 0;
  let updated = 0;
  for (const c of finalCandidates) {
    const status = surfacedKeys.has(c.key) ? "surfaced" : "provisional";
    const prior = existingByKey.get(c.key);

    if (prior) {
      await tx
        .update(opportunities)
        .set({
          title: c.title,
          description: c.description,
          category: c.category,
          departments: c.departments,
          impactLow: c.impactLow,
          impactHigh: c.impactHigh,
          timeToShipWeeksLow: c.timeToShipWeeksLow,
          timeToShipWeeksHigh: c.timeToShipWeeksHigh,
          confidenceScore: c.confidenceScore,
          compositeScore: c.compositeScore.toFixed(1),
          dimensionScores: c.dimensionScores,
          rationale: c.rationale,
          status,
          contributorCount: c.contributorCount,
        })
        .where(
          and(
            eq(opportunities.id, prior.id),
            eq(opportunities.tenantId, tenantId),
          ),
        );
      await replaceEvidence(tx, tenantId, prior.id, c.evidenceCaptureIds);
      updated++;
    } else {
      const [row] = await tx
        .insert(opportunities)
        .values({
          tenantId,
          sprintId,
          title: c.title,
          description: c.description,
          category: c.category,
          departments: c.departments,
          impactLow: c.impactLow,
          impactHigh: c.impactHigh,
          timeToShipWeeksLow: c.timeToShipWeeksLow,
          timeToShipWeeksHigh: c.timeToShipWeeksHigh,
          confidenceScore: c.confidenceScore,
          compositeScore: c.compositeScore.toFixed(1),
          dimensionScores: c.dimensionScores,
          rationale: c.rationale,
          status,
          contributorCount: c.contributorCount,
        })
        .returning({ id: opportunities.id });
      await replaceEvidence(tx, tenantId, row.id, c.evidenceCaptureIds);
      inserted++;
    }
  }

  return {
    sprintId,
    capturesConsidered: captureRows.length,
    clusters: clusters.length,
    scored: finalCandidates.length,
    inserted,
    updated,
    surfaced: surfacedKeys.size,
    skippedApproved,
  };
}

/** Replace an opportunity's evidence links (non-approved rows only — caller-checked). */
async function replaceEvidence(
  tx: Db,
  tenantId: string,
  opportunityId: string,
  captureIds: string[],
): Promise<void> {
  await tx
    .delete(opportunityEvidence)
    .where(
      and(
        eq(opportunityEvidence.opportunityId, opportunityId),
        eq(opportunityEvidence.tenantId, tenantId),
      ),
    );
  if (captureIds.length === 0) return;
  await tx.insert(opportunityEvidence).values(
    captureIds.map((captureId) => ({
      tenantId,
      opportunityId,
      captureId,
      weight: 1,
    })),
  );
}
