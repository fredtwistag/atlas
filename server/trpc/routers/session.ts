import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { router, tenantProcedure } from "../trpc";
import { withTenantContext } from "@/db/client";
import {
  sprints,
  topics,
  sessions,
  sprintParticipants,
  tenants,
  captures,
} from "@/db/schema";
import type { MyDashboard, SessionStatus } from "@/lib/types";

function fmtTs(d: Date | null): string | null {
  if (!d) return null;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export const sessionRouter = router({
  myDashboard: tenantProcedure.query(({ ctx }) =>
    withTenantContext(ctx.session, async (tx): Promise<MyDashboard | null> => {
      const [part] = await tx
        .select({ sprintId: sprintParticipants.sprintId })
        .from(sprintParticipants)
        .innerJoin(sprints, eq(sprintParticipants.sprintId, sprints.id))
        .where(
          and(
            eq(sprintParticipants.userId, ctx.session.userId),
            eq(sprints.status, "active"),
          ),
        )
        .orderBy(desc(sprints.createdAt))
        .limit(1);
      if (!part) return null;

      const [s] = await tx
        .select({ name: sprints.name, tenantId: sprints.tenantId })
        .from(sprints)
        .where(eq(sprints.id, part.sprintId));
      const [tenant] = await tx
        .select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, s.tenantId));

      const rows = await tx
        .select({
          id: sessions.id,
          topicId: sessions.topicId,
          status: sessions.status,
          completedAt: sessions.completedAt,
          editWindowEndsAt: sessions.editWindowEndsAt,
          captureCount: sessions.captureCount,
          totalSeconds: sessions.totalSeconds,
          topicTitle: topics.title,
          topicDescription: topics.description,
          estMinutes: topics.estMinutes,
        })
        .from(sessions)
        .leftJoin(topics, eq(sessions.topicId, topics.id))
        .where(
          and(
            eq(sessions.sprintId, part.sprintId),
            eq(sessions.userId, ctx.session.userId),
          ),
        )
        .orderBy(topics.orderIdx);

      return {
        sprintId: part.sprintId,
        sprintName: s.name,
        tenantName: tenant?.name ?? "",
        sessions: rows.map((r) => ({
          id: r.id,
          topicId: r.topicId ?? "",
          topicTitle: r.topicTitle ?? "Discovery session",
          topicDescription: r.topicDescription ?? "",
          estMinutes: r.estMinutes ?? 0,
          status: r.status as SessionStatus,
          completedAt: fmtTs(r.completedAt),
          editWindowEndsAt: fmtTs(r.editWindowEndsAt),
          captureCount: r.captureCount,
          totalSeconds: r.totalSeconds,
        })),
      };
    }),
  ),

  get: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) =>
      withTenantContext(ctx.session, async (tx) => {
        const [row] = await tx
          .select({ id: sessions.id, topicTitle: topics.title })
          .from(sessions)
          .leftJoin(topics, eq(sessions.topicId, topics.id))
          .where(eq(sessions.id, input.id));
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        return {
          id: row.id,
          topicTitle: row.topicTitle ?? "Discovery session",
        };
      }),
    ),

  editView: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) =>
      withTenantContext(ctx.session, async (tx) => {
        const [s] = await tx
          .select({
            id: sessions.id,
            completedAt: sessions.completedAt,
            editWindowEndsAt: sessions.editWindowEndsAt,
            topicTitle: topics.title,
          })
          .from(sessions)
          .leftJoin(topics, eq(sessions.topicId, topics.id))
          .where(
            and(
              eq(sessions.id, input.id),
              eq(sessions.userId, ctx.session.userId),
            ),
          );
        if (!s) throw new TRPCError({ code: "NOT_FOUND" });

        const caps = await tx
          .select({
            id: captures.id,
            kind: captures.kind,
            summary: captures.summary,
          })
          .from(captures)
          .where(
            and(
              eq(captures.sessionId, input.id),
              eq(captures.userId, ctx.session.userId),
              eq(captures.isRemoved, false),
            ),
          );

        return {
          topicTitle: s.topicTitle ?? "Discovery session",
          completedAt: fmtTs(s.completedAt),
          editWindowEndsAt: fmtTs(s.editWindowEndsAt),
          captures: caps,
        };
      }),
    ),
});
