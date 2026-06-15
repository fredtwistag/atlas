/**
 * Tx-level sprint reads (server-only, no Next imports — `lib/members.ts`
 * convention). Each takes an already-opened transaction so the same body can run
 * under a tenant context (manager/sponsor/IC routers) OR a Twistag cross-tenant
 * context (admin read-only report). Lifted verbatim from the sprint/opportunity
 * routers; those routers now call these, and their suites are the regression net.
 *
 * Privacy: these expose aggregates and opportunity metadata only — never capture
 * quotes or contributor names.
 */
import { cache } from "react";
import { eq, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Db } from "@/db/client";
import {
  sprints,
  topics,
  sprintParticipants,
  sessions,
  users,
  tenants,
  opportunities,
  captures,
  portfolios,
  portfolioItems,
  systemInventoryItems,
  stakeholders,
  stakeholderOpportunity,
} from "@/db/schema";
import {
  computeProgress,
  toOpportunity,
  type OpportunityRow,
} from "./dashboard-map";
import type {
  Sprint,
  Participant,
  SprintProgress,
  Opportunity,
  SprintPortfolio,
  PortfolioEntry,
  SystemInventoryEntry,
  StakeholderEntry,
} from "./types";

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
