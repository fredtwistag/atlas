import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, and, ne, gt, inArray } from "drizzle-orm";
import { router, tenantProcedure, managerProcedure } from "../trpc";
import { withTenantContext, withServiceRole } from "@/db/client";
import {
  sprints,
  topics,
  sprintParticipants,
  sessions,
  users,
  tenants,
  opportunities,
  captures,
  auditLog,
} from "@/db/schema";
import { computeProgress } from "@/lib/dashboard-map";
import { TOPIC_TEMPLATES } from "@/lib/topic-templates";
import { LaunchSprintSchema } from "@/lib/schemas";
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
      // The "current" sprint is the most recent one that isn't completed, so a
      // closed sprint frees the tenant to launch a new one.
      const rows = await tx
        .select({ id: sprints.id })
        .from(sprints)
        .where(ne(sprints.status, "completed"))
        .orderBy(desc(sprints.createdAt))
        .limit(1);
      return rows[0]?.id ?? null;
    }),
  ),

  close: managerProcedure.input(idInput).mutation(({ ctx, input }) =>
    withTenantContext(ctx.session, async (tx) => {
      const [existing] = await tx
        .select({ id: sprints.id })
        .from(sprints)
        .where(eq(sprints.id, input.id));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await tx
        .update(sprints)
        .set({ status: "completed", closedAt: new Date() })
        .where(eq(sprints.id, input.id));
      return { id: input.id, status: "completed" as const };
    }),
  ),

  update: managerProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(2).max(120).optional(),
        primaryFocus: z.string().min(2).max(160).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      withTenantContext(ctx.session, async (tx) => {
        const [existing] = await tx
          .select({ id: sprints.id })
          .from(sprints)
          .where(eq(sprints.id, input.id));
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

        const patch: Partial<{ name: string; primaryFocus: string }> = {};
        if (input.name !== undefined) patch.name = input.name;
        if (input.primaryFocus !== undefined)
          patch.primaryFocus = input.primaryFocus;
        if (Object.keys(patch).length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Nothing to update.",
          });
        }

        await tx.update(sprints).set(patch).where(eq(sprints.id, input.id));
        return { id: input.id };
      }),
    ),

  /**
   * Log a nudge to a participant. Real and audited, but email delivery ships
   * with the email phase — this records the intent and enforces a 48-hour
   * per-person cooldown. Runs as service_role so it can both read the audit
   * trail and write to it; every check is explicitly tenant-scoped since RLS
   * is bypassed.
   */
  nudge: managerProcedure
    .input(
      z.object({
        sprintId: z.string().uuid(),
        userId: z.string().uuid(),
        channel: z.enum(["email", "slack"]).default("email"),
        subject: z.string().max(200).optional(),
        body: z.string().min(1).max(5000),
      }),
    )
    .mutation(({ ctx, input }) =>
      withServiceRole(
        { action: "nudge.send", actor: ctx.session.userId },
        async (tx) => {
          const tenantId = ctx.session.tenantId;

          const [target] = await tx
            .select({ id: users.id })
            .from(users)
            .where(
              and(eq(users.id, input.userId), eq(users.tenantId, tenantId)),
            );
          if (!target) throw new TRPCError({ code: "NOT_FOUND" });

          const [spr] = await tx
            .select({ id: sprints.id })
            .from(sprints)
            .where(
              and(
                eq(sprints.id, input.sprintId),
                eq(sprints.tenantId, tenantId),
              ),
            );
          if (!spr) throw new TRPCError({ code: "NOT_FOUND" });

          const cutoff = new Date(Date.now() - 2 * DAY);
          const recent = await tx
            .select({ id: auditLog.id })
            .from(auditLog)
            .where(
              and(
                eq(auditLog.action, "nudge.sent"),
                eq(auditLog.tenantId, tenantId),
                eq(auditLog.userId, input.userId),
                gt(auditLog.at, cutoff),
              ),
            )
            .limit(1);
          if (recent.length > 0) {
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message:
                "A nudge was already sent to this person in the last 48 hours.",
            });
          }

          await tx.insert(auditLog).values({
            tenantId,
            userId: input.userId,
            action: "nudge.sent",
            targetId: input.sprintId,
            metadata: { channel: input.channel, actor: ctx.session.userId },
          });

          return { ok: true as const };
        },
      ),
    ),

  launch: managerProcedure
    .input(LaunchSprintSchema)
    .mutation(({ ctx, input }) =>
      withTenantContext(ctx.session, async (tx): Promise<string> => {
        const selectedTemplates = TOPIC_TEMPLATES.filter((t) =>
          input.topicKeys.includes(t.key),
        );
        if (selectedTemplates.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Pick at least one topic.",
          });
        }

        // Selected members (for sponsorId + scope_department).
        const members = await tx
          .select({
            id: users.id,
            role: users.role,
            department: users.department,
          })
          .from(users)
          .where(inArray(users.id, input.participantIds));
        const sponsorId = members.find((m) => m.role === "sponsor")?.id ?? null;
        const scope = Array.from(
          new Set(
            members.map((m) => m.department).filter((d): d is string => !!d),
          ),
        ).join(", ");

        const start = new Date();
        const end = new Date(start.getTime() + 24 * DAY);
        const fmt = (d: Date) => d.toISOString().slice(0, 10);

        const [sprint] = await tx
          .insert(sprints)
          .values({
            tenantId: ctx.session.tenantId,
            name: input.name,
            primaryFocus: input.primaryFocus,
            scopeDepartment: scope || null,
            startDate: fmt(start),
            endDate: fmt(end),
            cadence: "weekly",
            status: "active",
            managerId: ctx.session.userId,
            sponsorId,
          })
          .returning({ id: sprints.id });

        const topicRows = await tx
          .insert(topics)
          .values(
            selectedTemplates.map((t) => ({
              tenantId: ctx.session.tenantId,
              sprintId: sprint.id,
              title: t.title,
              description: t.description,
              orderIdx: t.orderIdx,
              questionCount: t.questionCount,
              estMinutes: t.estMinutes,
            })),
          )
          .returning({ id: topics.id });

        await tx.insert(sprintParticipants).values(
          input.participantIds.map((userId) => ({
            tenantId: ctx.session.tenantId,
            sprintId: sprint.id,
            userId,
            status: "not_started",
            sessionsCompleted: 0,
            sessionsTotal: topicRows.length,
            lastActiveLabel: "Invited · not started",
          })),
        );

        const sessionValues = input.participantIds.flatMap((userId) =>
          topicRows.map((t) => ({
            tenantId: ctx.session.tenantId,
            sprintId: sprint.id,
            topicId: t.id,
            userId,
            status: "not_started",
          })),
        );
        await tx.insert(sessions).values(sessionValues);

        return sprint.id;
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

      // Sponsor/manager are usually NOT participants, so resolve them from the
      // users table directly (fast-path via participants when they are one).
      const resolveUser = async (
        userId: string | null,
      ): Promise<Participant["user"] | undefined> => {
        if (!userId) return undefined;
        const inParticipants = participants.find(
          (p) => p.user.id === userId,
        )?.user;
        if (inParticipants) return inParticipants;
        const [u] = await tx
          .select()
          .from(users)
          .where(eq(users.id, userId));
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
      const manager = await resolveUser(s.managerId);
      const sponsor = await resolveUser(s.sponsorId);

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

  participant: managerProcedure
    .input(z.object({ sprintId: z.string().uuid(), userId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      withTenantContext(ctx.session, async (tx) => {
        const [row] = await tx
          .select({
            name: users.name,
            title: users.title,
            status: sprintParticipants.status,
            sessionsCompleted: sprintParticipants.sessionsCompleted,
            sessionsTotal: sprintParticipants.sessionsTotal,
            lastActiveLabel: sprintParticipants.lastActiveLabel,
          })
          .from(sprintParticipants)
          .innerJoin(users, eq(sprintParticipants.userId, users.id))
          .where(
            and(
              eq(sprintParticipants.sprintId, input.sprintId),
              eq(sprintParticipants.userId, input.userId),
            ),
          );
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });

        const sessionRows = await tx
          .select({
            topicTitle: topics.title,
            status: sessions.status,
            orderIdx: topics.orderIdx,
          })
          .from(sessions)
          .leftJoin(topics, eq(sessions.topicId, topics.id))
          .where(
            and(
              eq(sessions.sprintId, input.sprintId),
              eq(sessions.userId, input.userId),
            ),
          )
          .orderBy(topics.orderIdx);

        return {
          name: row.name,
          title: row.title ?? "Contributor",
          status: row.status,
          sessionsCompleted: row.sessionsCompleted,
          sessionsTotal: row.sessionsTotal,
          lastActiveLabel: row.lastActiveLabel ?? "",
          sessions: sessionRows.map((s) => ({
            topicTitle: s.topicTitle ?? "Session",
            status: s.status,
          })),
        };
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
