/**
 * Tx-level sprint reads (server-only, no Next imports — `lib/members.ts`
 * convention). Each takes an already-opened transaction so the same body can run
 * under a tenant context (manager/sponsor/IC routers) OR a Twistag cross-tenant
 * context (admin read-only report). Lifted verbatim from the sprint/opportunity
 * routers; those routers now call these, and their suites are the regression net.
 *
 * Privacy: these expose aggregates and opportunity metadata. Evidence quotes
 * carry the contributor's NAME + ROLE (de-anonymized 2026-06-20); email and
 * internal userId are never exposed. Names are never sent to the LLM.
 */
import { cache } from "react";
import { eq, desc, and, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Db } from "@/db/client";
import {
  sprints,
  topics,
  sprintParticipants,
  sessions,
  sessionMessages,
  users,
  tenants,
  opportunities,
  opportunityEvidence,
  captures,
  sowDrafts,
  portfolios,
  portfolioItems,
  systemInventoryItems,
  stakeholders,
  stakeholderOpportunity,
  workflowMaps,
} from "@/db/schema";
import {
  computeProgress,
  toOpportunity,
  type OpportunityRow,
} from "./dashboard-map";
import type { Currency } from "@/lib/format";
import type {
  Sprint,
  Participant,
  SprintProgress,
  Opportunity,
  Capture,
  SowDetail,
  SessionTranscript,
  SprintPortfolio,
  PortfolioEntry,
  SystemInventoryEntry,
  StakeholderEntry,
  SynthesisMemo,
} from "./types";
import type {
  WorkflowGraph,
  WorkflowMapView,
} from "@/services/synthesis/workflows/types";

const DAY = 86_400_000;

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function blankUser(): Sprint["manager"] {
  return {
    id: "",
    name: "—",
    email: "",
    role: "manager",
    department: "",
    title: "",
  };
}

/**
 * Full sprint detail (tenant + topics + participants + sponsor/manager).
 * `React.cache`-wrapped: dedupes repeat `(tx, id)` reads within one request
 * (e.g. the twistag report's parallel detail+progress load shares the tx).
 */
export const loadSprint = cache(async function loadSprint(
  tx: Db,
  id: string,
): Promise<Sprint> {
  const [s] = await tx.select().from(sprints).where(eq(sprints.id, id));
  if (!s) throw new TRPCError({ code: "NOT_FOUND" });

  const [tenant] = await tx
    .select()
    .from(tenants)
    .where(eq(tenants.id, s.tenantId));

  const topicRows = await tx
    .select()
    .from(topics)
    .where(eq(topics.sprintId, s.id))
    .orderBy(topics.orderIdx);

  const partRows = await tx
    .select({
      status: sprintParticipants.status,
      sessionsCompleted: sprintParticipants.sessionsCompleted,
      sessionsTotal: sprintParticipants.sessionsTotal,
      lastActiveLabel: sprintParticipants.lastActiveLabel,
      uid: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      department: users.department,
      title: users.title,
    })
    .from(sprintParticipants)
    .innerJoin(users, eq(sprintParticipants.userId, users.id))
    .where(eq(sprintParticipants.sprintId, s.id));

  const participants: Participant[] = partRows.map((p) => ({
    user: {
      id: p.uid,
      name: p.name,
      email: p.email,
      role: p.role as Participant["user"]["role"],
      department: p.department ?? "",
      title: p.title ?? "",
    },
    status: p.status as Participant["status"],
    sessionsCompleted: p.sessionsCompleted,
    sessionsTotal: p.sessionsTotal,
    lastActiveLabel: p.lastActiveLabel ?? "",
    capturesContributed: 0,
  }));

  // Sponsor/manager are usually NOT participants, so resolve them from the
  // users table directly (fast-path via participants when they are one).
  const resolveUser = async (
    userId: string | null,
  ): Promise<Participant["user"] | undefined> => {
    if (!userId) return undefined;
    const inParticipants = participants.find((p) => p.user.id === userId)?.user;
    if (inParticipants) return inParticipants;
    const [u] = await tx.select().from(users).where(eq(users.id, userId));
    if (!u) return undefined;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role as Participant["user"]["role"],
      department: u.department ?? "",
      title: u.title ?? "",
    };
  };
  const [manager, sponsor] = await Promise.all([
    resolveUser(s.managerId),
    resolveUser(s.sponsorId),
  ]);

  const start = new Date(s.startDate + "T00:00:00Z");
  const end = new Date(s.endDate + "T00:00:00Z");
  const dayTotal = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / DAY),
  );
  const dayOf = Math.min(
    dayTotal,
    Math.max(1, Math.round((Date.now() - start.getTime()) / DAY)),
  );

  return {
    id: s.id,
    tenantName: tenant?.name ?? "",
    tenantSegment: tenant?.segment ?? "",
    tenantCurrency: (tenant?.currency as Currency) ?? "EUR",
    tenantDomain: tenant?.domain ?? null,
    name: s.name,
    primaryFocus: s.primaryFocus,
    scopeDepartment: s.scopeDepartment ?? "",
    status: s.status as Sprint["status"],
    startDate: fmtDate(s.startDate),
    endDate: fmtDate(s.endDate),
    dayOf,
    dayTotal,
    cadence: s.cadence,
    topics: topicRows.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description ?? "",
      orderIdx: t.orderIdx,
      questionCount: t.questionCount,
      estMinutes: t.estMinutes,
    })),
    participants,
    sponsor: sponsor ?? manager ?? participants[0]?.user ?? blankUser(),
    manager: manager ?? participants[0]?.user ?? blankUser(),
  };
});

/**
 * The dashboard stat strip for a sprint. `React.cache`-wrapped to dedupe repeat
 * `(tx, id)` reads within a single request.
 */
export const loadSprintProgress = cache(async function loadSprintProgress(
  tx: Db,
  id: string,
): Promise<SprintProgress> {
  const parts = await tx
    .select({
      status: sprintParticipants.status,
      sessionsCompleted: sprintParticipants.sessionsCompleted,
      sessionsTotal: sprintParticipants.sessionsTotal,
    })
    .from(sprintParticipants)
    .where(eq(sprintParticipants.sprintId, id));
  const opps = await tx
    .select({ compositeScore: opportunities.compositeScore })
    .from(opportunities)
    .where(eq(opportunities.sprintId, id));
  const caps = await tx
    .select({ id: captures.id })
    .from(captures)
    .innerJoin(sessions, eq(captures.sessionId, sessions.id))
    .where(eq(sessions.sprintId, id));
  return computeProgress({
    participants: parts,
    opportunities: opps.map((o) => ({
      compositeScore: Number(o.compositeScore),
    })),
    capturesCount: caps.length,
    signalQuality: 4.6,
  });
});

/** Ranked opportunities for a sprint (no evidence — metadata only). */
export async function listSprintOpportunities(
  tx: Db,
  sprintId: string,
): Promise<Opportunity[]> {
  const rows = await tx
    .select()
    .from(opportunities)
    .where(eq(opportunities.sprintId, sprintId))
    .orderBy(desc(opportunities.compositeScore));
  return rows.map((r) => toOpportunity(r as OpportunityRow, []));
}

/**
 * One opportunity with its full, render-ready detail: name+role-attributed
 * evidence quotes (removed captures excluded, deduped by quote), scores, and
 * rationale.
 * Shared so the tenant detail page (sponsor/manager) and the Twistag admin
 * read-only drill-down return the identical contract.
 *
 * Privacy: evidence is attributed by NAME + ROLE so sponsors can follow up with
 * the contributor directly (de-anonymized 2026-06-20). Email and internal userId
 * never leave this layer; removed captures are still excluded.
 */
export async function loadOpportunityDetail(
  tx: Db,
  oppId: string,
): Promise<Opportunity> {
  const [row] = await tx
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, oppId));
  if (!row) throw new TRPCError({ code: "NOT_FOUND" });

  const evRows = await tx
    .select({
      id: captures.id,
      kind: captures.kind,
      summary: captures.summary,
      sourceQuote: captures.sourceQuote,
      sessionId: captures.sessionId,
      tags: captures.tags,
      isEdited: captures.isEdited,
      isRemoved: captures.isRemoved,
      name: users.name,
      role: users.title,
    })
    .from(opportunityEvidence)
    .innerJoin(captures, eq(opportunityEvidence.captureId, captures.id))
    .innerJoin(users, eq(captures.userId, users.id))
    // Removed captures (IC exercised the 7-day edit window) must never render
    // as evidence — plan 017.
    .where(
      and(
        eq(opportunityEvidence.opportunityId, oppId),
        eq(captures.isRemoved, false),
      ),
    );

  const evidence: Capture[] = evRows.map((e) => ({
    id: e.id,
    kind: e.kind as Capture["kind"],
    summary: e.summary,
    sourceQuote: e.sourceQuote,
    contributorName: e.name,
    contributorRole: e.role ?? "Contributor",
    sessionId: e.sessionId,
    tags: e.tags,
    isEdited: e.isEdited,
    isRemoved: e.isRemoved,
  }));

  const seenQuotes = new Set<string>();
  const dedupedEvidence = evidence.filter((e) => {
    const key = e.sourceQuote.toLowerCase().replace(/\s+/g, " ").trim();
    if (seenQuotes.has(key)) return false;
    seenQuotes.add(key);
    return true;
  });

  return toOpportunity(row as OpportunityRow, dedupedEvidence);
}

/**
 * The latest SOW draft for an opportunity (drafts can be regenerated), or null
 * if none has been generated yet. Shared by the admin read-only SOW view.
 */
export async function loadSowDraft(
  tx: Db,
  opportunityId: string,
): Promise<SowDetail | null> {
  const [row] = await tx
    .select()
    .from(sowDrafts)
    .where(eq(sowDrafts.opportunityId, opportunityId))
    .orderBy(desc(sowDrafts.createdAt))
    .limit(1);
  if (!row) return null;
  return {
    title: row.title,
    scope: row.scope,
    inclusions: row.inclusions,
    exclusions: row.exclusions,
    team: row.team as SowDetail["team"],
    durationWeeks: row.durationWeeks,
    priceUsd: row.priceUsd,
    successMetrics: row.successMetrics,
    status: row.status,
  };
}

/**
 * One session's full conversation transcript + meta (topic, contributor, status).
 * Admin-only in practice: `session_messages` is owner-gated for tenant contexts,
 * so only a Twistag cross-tenant read surfaces another person's transcript —
 * which is why name + role are exposed here ("Twistag debugging", CLAUDE.md).
 */
export async function loadSessionTranscript(
  tx: Db,
  sessionId: string,
): Promise<SessionTranscript> {
  const [s] = await tx
    .select({
      topicId: sessions.topicId,
      userId: sessions.userId,
      status: sessions.status,
      completedAt: sessions.completedAt,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId));
  if (!s) throw new TRPCError({ code: "NOT_FOUND" });

  const [contributor] = await tx
    .select({ name: users.name, role: users.title })
    .from(users)
    .where(eq(users.id, s.userId));

  let topicTitle = "Discovery session";
  if (s.topicId) {
    const [t] = await tx
      .select({ title: topics.title })
      .from(topics)
      .where(eq(topics.id, s.topicId));
    if (t) topicTitle = t.title;
  }

  const msgs = await tx
    .select({
      id: sessionMessages.id,
      role: sessionMessages.role,
      content: sessionMessages.content,
      arc: sessionMessages.arc,
    })
    .from(sessionMessages)
    .where(eq(sessionMessages.sessionId, sessionId))
    .orderBy(sessionMessages.createdAt);

  return {
    topicTitle,
    contributorName: contributor?.name ?? "Contributor",
    contributorRole: contributor?.role ?? "Contributor",
    status: s.status,
    completedAt: s.completedAt
      ? s.completedAt.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        })
      : null,
    messages: msgs.map((m) => ({
      id: m.id,
      role: m.role as "assistant" | "user",
      content: m.content,
      arc: m.arc,
    })),
  };
}

/** The pilot portfolio for a sprint (Ticket A), or null if none generated yet. */
export async function loadSprintPortfolio(
  tx: Db,
  sprintId: string,
): Promise<SprintPortfolio | null> {
  const [portfolio] = await tx
    .select({
      id: portfolios.id,
      narrative: portfolios.narrative,
      status: portfolios.status,
    })
    .from(portfolios)
    .where(eq(portfolios.sprintId, sprintId));
  if (!portfolio) return null;

  const rows = await tx
    .select({
      opportunityId: portfolioItems.opportunityId,
      sequenceOrder: portfolioItems.sequenceOrder,
      inclusionRationale: portfolioItems.inclusionRationale,
      title: opportunities.title,
      horizon: opportunities.horizon,
      delivery: opportunities.delivery,
      impactLow: opportunities.impactLow,
      impactHigh: opportunities.impactHigh,
      compositeScore: opportunities.compositeScore,
    })
    .from(portfolioItems)
    .innerJoin(
      opportunities,
      eq(portfolioItems.opportunityId, opportunities.id),
    )
    .where(eq(portfolioItems.portfolioId, portfolio.id))
    .orderBy(portfolioItems.sequenceOrder);

  return {
    status: portfolio.status as SprintPortfolio["status"],
    narrative: portfolio.narrative,
    items: rows.map((r) => ({
      opportunityId: r.opportunityId,
      title: r.title,
      horizon: r.horizon as PortfolioEntry["horizon"],
      delivery: r.delivery as PortfolioEntry["delivery"],
      impactLow: r.impactLow,
      impactHigh: r.impactHigh,
      compositeScore: Number(r.compositeScore),
      sequenceOrder: r.sequenceOrder,
      inclusionRationale: r.inclusionRationale,
    })),
  };
}

/** Current-state systems inventory for a sprint (Ticket F). */
export async function loadSystemsInventory(
  tx: Db,
  sprintId: string,
): Promise<SystemInventoryEntry[]> {
  const rows = await tx
    .select({
      id: systemInventoryItems.id,
      name: systemInventoryItems.name,
      category: systemInventoryItems.category,
      summary: systemInventoryItems.summary,
    })
    .from(systemInventoryItems)
    .where(eq(systemInventoryItems.sprintId, sprintId))
    .orderBy(systemInventoryItems.category);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category as SystemInventoryEntry["category"],
    summary: r.summary,
  }));
}

/** The cached board-ready synthesis memo for a sprint (Ticket G), or null. */
export async function loadSynthesisMemo(
  tx: Db,
  sprintId: string,
): Promise<SynthesisMemo | null> {
  const [row] = await tx
    .select({ memo: sprints.synthesisMemo })
    .from(sprints)
    .where(eq(sprints.id, sprintId));
  return (row?.memo as SynthesisMemo | null) ?? null;
}

/** Stakeholder map for a sprint (Ticket B). Role labels only — never names. */
export async function loadStakeholders(
  tx: Db,
  sprintId: string,
): Promise<StakeholderEntry[]> {
  const rows = await tx
    .select({
      id: stakeholders.id,
      roleLabel: stakeholders.roleLabel,
      department: stakeholders.department,
      type: stakeholders.type,
      summary: stakeholders.summary,
    })
    .from(stakeholders)
    .where(eq(stakeholders.sprintId, sprintId));
  if (rows.length === 0) return [];

  const links = await tx
    .select({
      stakeholderId: stakeholderOpportunity.stakeholderId,
      opportunityId: stakeholderOpportunity.opportunityId,
    })
    .from(stakeholderOpportunity)
    .innerJoin(
      stakeholders,
      eq(stakeholderOpportunity.stakeholderId, stakeholders.id),
    )
    .where(eq(stakeholders.sprintId, sprintId));

  const gatedBy = new Map<string, string[]>();
  for (const l of links) {
    const arr = gatedBy.get(l.stakeholderId) ?? [];
    arr.push(l.opportunityId);
    gatedBy.set(l.stakeholderId, arr);
  }

  return rows.map((r) => ({
    id: r.id,
    roleLabel: r.roleLabel,
    department: r.department,
    type: r.type as StakeholderEntry["type"],
    summary: r.summary,
    gatedOpportunityIds: gatedBy.get(r.id) ?? [],
  }));
}

/**
 * Workflow diagram maps for a sprint, render-ready. Under a tenant context RLS
 * returns only `surfaced` maps; under a Twistag context it returns all. Evidence
 * captureIds are resolved to NAME + ROLE (de-anonymized 2026-06-20); removed
 * captures and email/userId never appear. Quotes deduped per map.
 */
export async function loadWorkflowMaps(
  tx: Db,
  sprintId: string,
): Promise<WorkflowMapView[]> {
  const rows = await tx
    .select({
      id: workflowMaps.id,
      graph: workflowMaps.graph,
    })
    .from(workflowMaps)
    // Sprint-level maps only; opportunity-scoped before/after rows (Plan 3,
    // opportunityId set) are read separately on the opportunity page.
    .where(and(eq(workflowMaps.sprintId, sprintId), isNull(workflowMaps.opportunityId)))
    .orderBy(workflowMaps.kind);
  if (rows.length === 0) return [];

  const graphs = rows.map((r) => r.graph as WorkflowGraph);
  const allIds = new Set<string>();
  for (const g of graphs) {
    for (const s of g.steps) for (const id of s.captureIds) allIds.add(id);
    for (const e of g.edges) for (const id of e.captureIds) allIds.add(id);
  }

  const evRows =
    allIds.size > 0
      ? await tx
          .select({
            id: captures.id,
            kind: captures.kind,
            summary: captures.summary,
            sourceQuote: captures.sourceQuote,
            sessionId: captures.sessionId,
            tags: captures.tags,
            isEdited: captures.isEdited,
            isRemoved: captures.isRemoved,
            name: users.name,
            role: users.title,
          })
          .from(captures)
          .innerJoin(users, eq(captures.userId, users.id))
          .where(and(inArray(captures.id, [...allIds]), eq(captures.isRemoved, false)))
      : [];
  const capById = new Map(evRows.map((e) => [e.id, e]));

  return graphs.map((g, i) => {
    const ids = new Set<string>();
    for (const s of g.steps) for (const id of s.captureIds) ids.add(id);
    for (const e of g.edges) for (const id of e.captureIds) ids.add(id);

    const evidence: Capture[] = [];
    const seenQuotes = new Set<string>();
    const sessionsSet = new Set<string>();
    for (const id of ids) {
      const e = capById.get(id);
      if (!e) continue;
      if (e.sessionId) sessionsSet.add(e.sessionId);
      const key = e.sourceQuote.toLowerCase().replace(/\s+/g, " ").trim();
      if (seenQuotes.has(key)) continue;
      seenQuotes.add(key);
      evidence.push({
        id: e.id,
        kind: e.kind as Capture["kind"],
        summary: e.summary,
        sourceQuote: e.sourceQuote,
        contributorName: e.name,
        contributorRole: e.role ?? "Contributor",
        sessionId: e.sessionId,
        tags: e.tags,
        isEdited: e.isEdited,
        isRemoved: e.isRemoved,
      });
    }

    return {
      id: rows[i].id,
      kind: g.kind,
      title: g.title,
      graph: g,
      confidence: g.confidence,
      basedOnSessions: sessionsSet.size,
      evidence,
    };
  });
}

/**
 * The current-state workflow diagram for one opportunity, or null. Under a
 * tenant context RLS returns it only when surfaced. Evidence resolved to
 * name + role (de-anonymized 2026-06-20); removed captures excluded.
 */
export async function loadOpportunityWorkflow(
  tx: Db,
  opportunityId: string,
): Promise<WorkflowMapView | null> {
  const [row] = await tx
    .select({ id: workflowMaps.id, kind: workflowMaps.kind, graph: workflowMaps.graph })
    .from(workflowMaps)
    .where(eq(workflowMaps.opportunityId, opportunityId))
    .limit(1);
  if (!row) return null;

  const g = row.graph as WorkflowGraph;
  const ids = new Set<string>();
  for (const s of g.steps) for (const id of s.captureIds) ids.add(id);
  for (const e of g.edges) for (const id of e.captureIds) ids.add(id);

  const evRows = ids.size
    ? await tx
        .select({
          id: captures.id, kind: captures.kind, summary: captures.summary,
          sourceQuote: captures.sourceQuote, sessionId: captures.sessionId,
          tags: captures.tags, isEdited: captures.isEdited, isRemoved: captures.isRemoved,
          name: users.name, role: users.title,
        })
        .from(captures)
        .innerJoin(users, eq(captures.userId, users.id))
        .where(and(inArray(captures.id, [...ids]), eq(captures.isRemoved, false)))
    : [];

  const evidence: Capture[] = [];
  const seen = new Set<string>();
  const sessions = new Set<string>();
  for (const e of evRows) {
    if (e.sessionId) sessions.add(e.sessionId);
    const key = e.sourceQuote.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    evidence.push({
      id: e.id, kind: e.kind as Capture["kind"], summary: e.summary, sourceQuote: e.sourceQuote,
      contributorName: e.name, contributorRole: e.role ?? "Contributor", sessionId: e.sessionId,
      tags: e.tags, isEdited: e.isEdited, isRemoved: e.isRemoved,
    });
  }

  return {
    id: row.id,
    kind: g.kind,
    title: g.title,
    graph: g,
    confidence: g.confidence,
    basedOnSessions: sessions.size,
    evidence,
  };
}
