import { eq, and, isNull, isNotNull, inArray } from "drizzle-orm";
import { withServiceRole, type Db } from "@/db/client";
import {
  sprints,
  tenants,
  sessions,
  captures,
  companyContext,
  users,
  opportunities,
  opportunityEvidence,
  portfolios,
  portfolioItems,
  systemInventoryItems,
  systemInventoryEvidence,
  stakeholders,
  stakeholderOpportunity,
  workflowMaps,
  sowDrafts,
} from "@/db/schema";
import { synthesizeWorkflows } from "@/services/synthesis/workflows/synthesize";
import { generateOpportunityDiagram } from "@/services/synthesis/workflows/opportunity-diagram";
import type {
  OpportunityPoint,
  WorkflowCapture,
} from "@/services/synthesis/workflows/types";
import {
  selectPortfolio,
  writePortfolioNarrative,
  type PortfolioCandidate,
} from "@/services/synthesis/portfolio";
import {
  clusterSystems,
  type SystemCapture,
} from "@/services/synthesis/systems";
import {
  mapStakeholders,
  type StakeholderCapture,
  type StakeholderOpportunity,
} from "@/services/synthesis/stakeholders";
import {
  DIMENSION_LABELS,
  scoreCluster,
  computeHorizon,
  type ScoreCapture,
  type CostBasis,
} from "./score";
import { type Currency } from "@/lib/format";
import { clusterCaptures } from "./cluster";
import type { DimensionScore, Horizon, DeliveryPath } from "@/lib/types";
import type { QuantifiedImpact } from "@/services/llm/schemas";

/**
 * Coerce a capture's numeric (text) quantified columns back into the structured
 * QuantifiedImpact the scorer expects. Returns null when none were recorded.
 */
function toQuantifiedImpact(c: {
  quantifiedFrequencyPerYear: string | null;
  quantifiedUnitMinutes: string | null;
  quantifiedUnitCostUsd: string | null;
  quantifiedBasis: string | null;
}): QuantifiedImpact | null {
  if (
    c.quantifiedFrequencyPerYear == null &&
    c.quantifiedUnitMinutes == null &&
    c.quantifiedUnitCostUsd == null &&
    c.quantifiedBasis == null
  ) {
    return null;
  }
  return {
    frequencyPerYear:
      c.quantifiedFrequencyPerYear != null
        ? Number(c.quantifiedFrequencyPerYear)
        : null,
    unitMinutes:
      c.quantifiedUnitMinutes != null ? Number(c.quantifiedUnitMinutes) : null,
    unitCostUsd:
      c.quantifiedUnitCostUsd != null ? Number(c.quantifiedUnitCostUsd) : null,
    basis: c.quantifiedBasis,
  };
}

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
 * - Pruning: existing non-approved rows the current run did NOT reproduce are
 *   hard-deleted (with their child rows — no FK cascade on opportunity_id), so
 *   non-deterministic clustering can't accumulate stale `surfaced` duplicates
 *   that leak into the client report. `approved` rows are exempt.
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
  /** Stale non-approved rows the current run no longer produced, hard-deleted. */
  pruned: number;
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
  horizon: Horizon;
  delivery: DeliveryPath;
  deliveryRationale: string;
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
      costBasis: sprints.costBasis,
    })
    .from(sprints)
    .where(eq(sprints.id, sprintId));
  if (!sprint) throw new Error("sprint not found");
  const tenantId = sprint.tenantId;
  const day = sprintDay(sprint.startDate, now);

  const [tenant] = await tx
    .select({ name: tenants.name, currency: tenants.currency })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  const tenantName = tenant?.name ?? "your organization";
  const currency = (tenant?.currency as Currency) ?? "EUR";

  // Company profile (CTX-4) grounds financial baselines. Only active context.
  const [ctx] = await tx
    .select({
      industry: companyContext.industry,
      sizeBand: companyContext.sizeBand,
      status: companyContext.status,
    })
    .from(companyContext)
    .where(eq(companyContext.tenantId, tenantId));
  const companyProfile =
    ctx && ctx.status === "active"
      ? { industry: ctx.industry, sizeBand: ctx.sizeBand }
      : null;

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
      quantifiedFrequencyPerYear: captures.quantifiedFrequencyPerYear,
      quantifiedUnitMinutes: captures.quantifiedUnitMinutes,
      quantifiedUnitCostUsd: captures.quantifiedUnitCostUsd,
      quantifiedBasis: captures.quantifiedBasis,
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
    pruned: 0,
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
        quantifiedImpact: toQuantifiedImpact(c),
      }));
    if (clusterCapturesData.length < 2) continue;

    const { scoring, composite } = await scoreCluster({
      theme: cluster.theme,
      tenantName,
      captures: clusterCapturesData,
      currency,
      costBasis: (sprint.costBasis as CostBasis | null) ?? null,
      companyProfile,
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
      horizon: computeHorizon(
        scoring.dimensionScores,
        scoring.timeToShipWeeksHigh,
      ),
      delivery: scoring.delivery,
      deliveryRationale: scoring.deliveryRationale,
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
      (c) => day >= SURFACE_DAY && c.confidenceScore >= SURFACE_MIN_CONFIDENCE,
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

  const existingByKey = new Map<string, { id: string; status: string }>();
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
  // Persisted opportunity id per candidate key — feeds the portfolio (Ticket A).
  const idByKey = new Map<string, string>();
  // Existing (non-approved) rows this run reproduced; the rest are pruned below.
  const keptIds = new Set<string>();
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
          horizon: c.horizon,
          delivery: c.delivery,
          deliveryRationale: c.deliveryRationale,
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
      idByKey.set(c.key, prior.id);
      keptIds.add(prior.id);
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
          horizon: c.horizon,
          delivery: c.delivery,
          deliveryRationale: c.deliveryRationale,
          dimensionScores: c.dimensionScores,
          rationale: c.rationale,
          status,
          contributorCount: c.contributorCount,
        })
        .returning({ id: opportunities.id });
      await replaceEvidence(tx, tenantId, row.id, c.evidenceCaptureIds);
      idByKey.set(c.key, row.id);
      inserted++;
    }
  }

  // --- prune stale opportunities -------------------------------------------
  // Existing non-approved rows the current run did NOT reproduce (LLM clustering
  // is non-deterministic, so titles/keys drift run to run). Left in place they
  // keep their old `surfaced` status forever and leak into the client report.
  // Hard-delete them (and their child rows — no FK cascade on opportunity_id),
  // before rebuilding the derived artifacts below. `approved` rows are never in
  // `existing`-non-approved scope, so they are exempt by construction.
  const staleIds = existing
    .filter((row) => row.status !== "approved" && !keptIds.has(row.id))
    .map((row) => row.id);
  await pruneOpportunities(tx, tenantId, staleIds);

  // --- pilot portfolio (Ticket A) ------------------------------------------
  // Select a balanced 3-5 set from the surfaced opportunities and persist it
  // with an LLM narrative. Regenerated each recompute (derived artifact).
  await buildPortfolio(tx, {
    tenantId,
    sprintId,
    tenantName,
    candidates: finalCandidates
      .filter((c) => surfacedKeys.has(c.key) && idByKey.has(c.key))
      .map((c) => ({
        id: idByKey.get(c.key)!,
        title: c.title,
        horizon: c.horizon,
        departments: c.departments,
        compositeScore: c.compositeScore,
        confidenceScore: c.confidenceScore,
        impactLow: c.impactLow,
        impactHigh: c.impactHigh,
      })),
  });

  // --- current-state systems inventory (Ticket F) --------------------------
  await buildSystemsInventory(tx, {
    tenantId,
    sprintId,
    captures: captureRows.map((c) => ({
      id: c.id,
      kind: c.kind,
      summary: c.summary,
    })),
  });

  // --- workflow diagram graphs (Plan 1) ------------------------------------
  await buildWorkflowMaps(tx, {
    tenantId,
    sprintId,
    captures: captureRows.map((c) => ({
      id: c.id,
      kind: c.kind,
      summary: c.summary,
      role: c.role ?? "",
      department: c.department ?? null,
      contributorId: c.userId,
    })),
    opportunities: finalCandidates
      .filter((c) => idByKey.has(c.key))
      .map((c) => ({
        id: idByKey.get(c.key)!,
        title: c.title,
        impactHigh: c.impactHigh,
        timeToShipWeeksHigh: c.timeToShipWeeksHigh,
        horizon: c.horizon,
      })),
    roleLabels: [
      ...new Set(
        captureRows
          .map((c) => c.role)
          .filter((r): r is string => Boolean(r)),
      ),
    ],
  });

  // --- per-opportunity workflow diagrams ------------------------------------
  const wfCapturesById = new Map<string, WorkflowCapture>(
    captureRows.map((c) => [
      c.id,
      {
        id: c.id,
        kind: c.kind,
        summary: c.summary,
        role: c.role ?? "",
        department: c.department ?? null,
        contributorId: c.userId,
      },
    ]),
  );
  await buildOpportunityWorkflows(tx, {
    tenantId,
    sprintId,
    capturesById: wfCapturesById,
    roleLabels: [
      ...new Set(captureRows.map((c) => c.role).filter((r): r is string => Boolean(r))),
    ],
    modelVersion: `${process.env.ATLAS_LLM_MODEL ?? "claude-sonnet-4-6"}:wf-v1`,
  });

  // --- sprint themes cache (EXT-1) -----------------------------------------
  // Privacy-safe theme labels (no names/quotes) injected into later sessions so
  // contributors corroborate/extend rather than restate. Capped + deduped.
  const themes = [...new Set(clusters.map((c) => c.theme.trim()))]
    .filter(Boolean)
    .slice(0, 8);
  await tx
    .update(sprints)
    .set({ sprintThemes: { themes } })
    .where(eq(sprints.id, sprintId));

  // --- stakeholder map (Ticket B) ------------------------------------------
  await buildStakeholderMap(tx, {
    tenantId,
    sprintId,
    captures: captureRows.map((c) => ({
      kind: c.kind,
      summary: c.summary,
      role: c.role ?? "Contributor",
    })),
    opportunities: finalCandidates
      .filter((c) => idByKey.has(c.key))
      .map((c) => ({ id: idByKey.get(c.key)!, title: c.title })),
    roles: captureRows.map((c) => c.role ?? "Contributor"),
  });

  return {
    sprintId,
    capturesConsidered: captureRows.length,
    clusters: clusters.length,
    scored: finalCandidates.length,
    inserted,
    updated,
    surfaced: surfacedKeys.size,
    skippedApproved,
    pruned: staleIds.length,
  };
}

/**
 * Hard-delete stale opportunities and every child row that references them.
 * `opportunity_id` has no FK cascade (see schema.ts), so each child table is
 * cleared explicitly, parents last. Caller guarantees `ids` excludes approved
 * rows. No-op for an empty list.
 */
async function pruneOpportunities(
  tx: Db,
  tenantId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  await tx
    .delete(opportunityEvidence)
    .where(
      and(
        inArray(opportunityEvidence.opportunityId, ids),
        eq(opportunityEvidence.tenantId, tenantId),
      ),
    );
  await tx
    .delete(portfolioItems)
    .where(
      and(
        inArray(portfolioItems.opportunityId, ids),
        eq(portfolioItems.tenantId, tenantId),
      ),
    );
  await tx
    .delete(stakeholderOpportunity)
    .where(
      and(
        inArray(stakeholderOpportunity.opportunityId, ids),
        eq(stakeholderOpportunity.tenantId, tenantId),
      ),
    );
  await tx
    .delete(workflowMaps)
    .where(
      and(
        inArray(workflowMaps.opportunityId, ids),
        eq(workflowMaps.tenantId, tenantId),
      ),
    );
  await tx
    .delete(sowDrafts)
    .where(
      and(
        inArray(sowDrafts.opportunityId, ids),
        eq(sowDrafts.tenantId, tenantId),
      ),
    );
  await tx
    .delete(opportunities)
    .where(
      and(inArray(opportunities.id, ids), eq(opportunities.tenantId, tenantId)),
    );
}

/**
 * Cluster tooling/workaround captures into a categorized systems inventory and
 * persist it (Ticket F). Idempotent: the sprint's existing items are deleted
 * (cascading evidence) and rebuilt. A clustering failure degrades to leaving
 * the prior inventory in place (best-effort, never fails recompute).
 */
/**
 * Derive + persist the stakeholder map (Ticket B). Best-effort (a failure
 * leaves the prior map); idempotent — the sprint's stakeholders are replaced
 * (cascading the opportunity join). Role labels only, never names.
 */
async function buildStakeholderMap(
  tx: Db,
  opts: {
    tenantId: string;
    sprintId: string;
    captures: StakeholderCapture[];
    opportunities: StakeholderOpportunity[];
    roles: string[];
  },
): Promise<void> {
  let mapped;
  try {
    mapped = await mapStakeholders({
      captures: opts.captures,
      opportunities: opts.opportunities,
      roles: opts.roles,
    });
  } catch {
    return; // best-effort
  }
  if (mapped.length === 0) return;

  await tx.delete(stakeholders).where(eq(stakeholders.sprintId, opts.sprintId));

  for (const s of mapped) {
    const [row] = await tx
      .insert(stakeholders)
      .values({
        tenantId: opts.tenantId,
        sprintId: opts.sprintId,
        roleLabel: s.roleLabel,
        department: s.department,
        type: s.type,
        summary: s.summary,
      })
      .returning({ id: stakeholders.id });
    if (s.gatedOpportunityIds.length > 0) {
      await tx.insert(stakeholderOpportunity).values(
        s.gatedOpportunityIds.map((opportunityId) => ({
          tenantId: opts.tenantId,
          stakeholderId: row.id,
          opportunityId,
        })),
      );
    }
  }
}

async function buildSystemsInventory(
  tx: Db,
  opts: { tenantId: string; sprintId: string; captures: SystemCapture[] },
): Promise<void> {
  let items;
  try {
    items = await clusterSystems(opts.captures);
  } catch {
    return; // best-effort
  }
  if (items.length === 0) return;

  // Replace the sprint's inventory (cascade clears evidence).
  await tx
    .delete(systemInventoryItems)
    .where(eq(systemInventoryItems.sprintId, opts.sprintId));

  for (const item of items) {
    const [row] = await tx
      .insert(systemInventoryItems)
      .values({
        tenantId: opts.tenantId,
        sprintId: opts.sprintId,
        name: item.name,
        category: item.category,
        summary: item.summary,
      })
      .returning({ id: systemInventoryItems.id });
    if (item.captureIds.length > 0) {
      await tx.insert(systemInventoryEvidence).values(
        item.captureIds.map((captureId) => ({
          tenantId: opts.tenantId,
          itemId: row.id,
          captureId,
        })),
      );
    }
  }
}

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

  // Replace the sprint-level map (the matrix); surfaced so the report shows it.
  await tx
    .delete(workflowMaps)
    .where(and(eq(workflowMaps.sprintId, opts.sprintId), isNull(workflowMaps.opportunityId)));

  for (const graph of graphs) {
    await tx.insert(workflowMaps).values({
      tenantId: opts.tenantId,
      sprintId: opts.sprintId,
      kind: graph.kind,
      graph,
      status: "surfaced",
      opportunityId: null,
    });
  }
}

/**
 * Generate + persist one current-state diagram per opportunity — ANY status
 * (surfaced, provisional, approved) — from that opportunity's own evidence
 * captures. Reads the sprint's opportunities + their evidence directly so it
 * also covers approved opps (which the current run doesn't re-cluster).
 * Idempotent: replaces all opportunity-scoped maps for the sprint. Best-effort
 * per opportunity; abstains (no row) when the evidence can't support a diagram.
 */
async function buildOpportunityWorkflows(
  tx: Db,
  opts: {
    tenantId: string;
    sprintId: string;
    capturesById: Map<string, WorkflowCapture>;
    roleLabels: string[];
    modelVersion: string;
  },
): Promise<void> {
  await tx
    .delete(workflowMaps)
    .where(and(eq(workflowMaps.sprintId, opts.sprintId), isNotNull(workflowMaps.opportunityId)));

  const opps = await tx
    .select({ id: opportunities.id, title: opportunities.title })
    .from(opportunities)
    .where(eq(opportunities.sprintId, opts.sprintId));
  if (opps.length === 0) return;

  const evidence = await tx
    .select({
      opportunityId: opportunityEvidence.opportunityId,
      captureId: opportunityEvidence.captureId,
    })
    .from(opportunityEvidence)
    .where(inArray(opportunityEvidence.opportunityId, opps.map((o) => o.id)));
  const capIdsByOpp = new Map<string, string[]>();
  for (const e of evidence) {
    const arr = capIdsByOpp.get(e.opportunityId);
    if (arr) arr.push(e.captureId);
    else capIdsByOpp.set(e.opportunityId, [e.captureId]);
  }

  for (const opp of opps) {
    const caps = (capIdsByOpp.get(opp.id) ?? [])
      .map((id) => opts.capturesById.get(id))
      .filter((c): c is WorkflowCapture => c !== undefined);
    if (caps.length === 0) continue;

    let graph;
    try {
      graph = await generateOpportunityDiagram({ title: opp.title }, caps, opts.roleLabels, opts.modelVersion);
    } catch {
      continue; // best-effort
    }
    if (!graph) continue;

    await tx.insert(workflowMaps).values({
      tenantId: opts.tenantId,
      sprintId: opts.sprintId,
      kind: graph.kind,
      graph,
      status: "surfaced",
      opportunityId: opp.id,
    });
  }
}

/**
 * Build (or replace) the sprint's pilot portfolio: TS selection + LLM narrative,
 * persisted as one `draft` portfolio + its items. Idempotent — items are
 * replaced each run. A narrative failure degrades to an empty string (never
 * fails recompute). No portfolio row is written when nothing is surfaced.
 */
async function buildPortfolio(
  tx: Db,
  opts: {
    tenantId: string;
    sprintId: string;
    tenantName: string;
    candidates: (PortfolioCandidate & {
      impactLow: number;
      impactHigh: number;
    })[];
  },
): Promise<void> {
  const selection = selectPortfolio(opts.candidates);
  if (selection.items.length === 0) return;

  const byId = new Map(opts.candidates.map((c) => [c.id, c]));
  let narrative = "";
  try {
    narrative = await writePortfolioNarrative({
      tenantName: opts.tenantName,
      underfilled: selection.underfilled,
      items: selection.items.map((it) => {
        const c = byId.get(it.opportunityId)!;
        return {
          title: c.title,
          horizon: c.horizon,
          impactLow: c.impactLow,
          impactHigh: c.impactHigh,
        };
      }),
    });
  } catch {
    narrative = ""; // best-effort; selection still persists.
  }

  const [existing] = await tx
    .select({ id: portfolios.id })
    .from(portfolios)
    .where(eq(portfolios.sprintId, opts.sprintId));

  let portfolioId: string;
  if (existing) {
    portfolioId = existing.id;
    await tx
      .update(portfolios)
      .set({ narrative, updatedAt: new Date() })
      .where(eq(portfolios.id, portfolioId));
    await tx
      .delete(portfolioItems)
      .where(eq(portfolioItems.portfolioId, portfolioId));
  } else {
    const [row] = await tx
      .insert(portfolios)
      .values({
        tenantId: opts.tenantId,
        sprintId: opts.sprintId,
        narrative,
        status: "draft",
      })
      .returning({ id: portfolios.id });
    portfolioId = row.id;
  }

  await tx.insert(portfolioItems).values(
    selection.items.map((it) => ({
      portfolioId,
      opportunityId: it.opportunityId,
      tenantId: opts.tenantId,
      sequenceOrder: it.sequenceOrder,
      inclusionRationale: it.inclusionRationale,
    })),
  );
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
