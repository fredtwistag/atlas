import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc } from "drizzle-orm";
import { router, tenantProcedure } from "../trpc";
import { withTenantContext } from "@/db/client";
import {
  sprints,
  topics,
  sprintParticipants,
  users,
  tenants,
  opportunities,
  captures,
} from "@/db/schema";
import { computeProgress } from "@/lib/dashboard-map";
import type {
  Sprint,
  Participant,
  SprintProgress,
  ActivityItem,
} from "@/lib/types";

const idInput = z.object({ id: z.string().uuid() });
const DAY = 86_400_000;

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export const sprintRouter = router({
  currentForTenant: tenantProcedure.query(({ ctx }) =>
    withTenantContext(ctx.session, async (tx) => {
      const rows = await tx
        .select({ id: sprints.id })
        .from(sprints)
        .orderBy(desc(sprints.createdAt))
        .limit(1);
      return rows[0]?.id ?? null;
    }),
  ),

  get: tenantProcedure.input(idInput).query(({ ctx, input }) =>
    withTenantContext(ctx.session, async (tx): Promise<Sprint> => {
      const [s] = await tx
        .select()
        .from(sprints)
        .where(eq(sprints.id, input.id));
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

      const manager = participants.find((p) => p.user.id === s.managerId)?.user;
      const sponsor = participants.find((p) => p.user.id === s.sponsorId)?.user;

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
    }),
  ),

  progress: tenantProcedure.input(idInput).query(({ ctx, input }) =>
    withTenantContext(ctx.session, async (tx): Promise<SprintProgress> => {
      const parts = await tx
        .select({
          status: sprintParticipants.status,
          sessionsCompleted: sprintParticipants.sessionsCompleted,
          sessionsTotal: sprintParticipants.sessionsTotal,
        })
        .from(sprintParticipants)
        .where(eq(sprintParticipants.sprintId, input.id));
      const opps = await tx
        .select({ compositeScore: opportunities.compositeScore })
        .from(opportunities)
        .where(eq(opportunities.sprintId, input.id));
      const caps = await tx.select({ id: captures.id }).from(captures);
      return computeProgress({
        participants: parts,
        opportunities: opps.map((o) => ({
          compositeScore: Number(o.compositeScore),
        })),
        capturesCount: caps.length,
        signalQuality: 4.6,
      });
    }),
  ),

  activity: tenantProcedure.input(idInput).query(({ ctx, input }) =>
    withTenantContext(ctx.session, async (tx): Promise<ActivityItem[]> => {
      const opps = await tx
        .select({ title: opportunities.title })
        .from(opportunities)
        .where(eq(opportunities.sprintId, input.id))
        .orderBy(desc(opportunities.createdAt))
        .limit(5);
      return opps.map((o, i) => ({
        id: `op-${i}`,
        kind: "opportunity_surfaced" as const,
        label: `Opportunity surfaced: “${o.title}”`,
        timeLabel: "recently",
      }));
    }),
  ),
});

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
