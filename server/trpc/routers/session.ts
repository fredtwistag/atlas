import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { router, tenantProcedure } from "../trpc";
import { withTenantContext } from "@/db/client";
import {
  sprints,
  topics,
  sessions,
  sprintParticipants,
  sessionMessages,
  tenants,
  captures,
} from "@/db/schema";
import type { MyDashboard, SessionStatus } from "@/lib/types";
import {
  openSession,
  takeTurn,
} from "@/services/conversation/engine";
import { LlmNotConfiguredError } from "@/services/llm/client";

/** Map an LLM-config error to a clear tRPC error; rethrow anything else. */
function mapLlmError(err: unknown): never {
  if (err instanceof LlmNotConfiguredError) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Conversation engine not configured — set ANTHROPIC_API_KEY to start a session.",
    });
  }
  throw err;
}

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

  /**
   * Start (or resume) a conversation. Validates ownership, flips a not_started
   * session to in_progress, and — if the transcript is empty — generates the
   * INTRO opener via the engine. Returns the full ordered transcript so the
   * caller can render it. Idempotent: calling again on a session that already
   * has messages just returns them.
   */
  start: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      withTenantContext(ctx.session, async (tx) => {
        const [s] = await tx
          .select({ id: sessions.id, status: sessions.status })
          .from(sessions)
          .where(
            and(
              eq(sessions.id, input.id),
              eq(sessions.userId, ctx.session.userId),
            ),
          );
        if (!s) throw new TRPCError({ code: "NOT_FOUND" });

        if (s.status === "not_started") {
          await tx
            .update(sessions)
            .set({ status: "in_progress" })
            .where(
              and(
                eq(sessions.id, input.id),
                eq(sessions.userId, ctx.session.userId),
              ),
            );
        }

        const existing = await tx
          .select({ id: sessionMessages.id })
          .from(sessionMessages)
          .where(eq(sessionMessages.sessionId, input.id))
          .limit(1);

        if (existing.length === 0) {
          try {
            await openSession({
              db: tx,
              tenantId: ctx.session.tenantId,
              sessionId: input.id,
              userId: ctx.session.userId,
            });
          } catch (err) {
            mapLlmError(err);
          }
        }

        const messages = await tx
          .select({
            role: sessionMessages.role,
            content: sessionMessages.content,
            arc: sessionMessages.arc,
          })
          .from(sessionMessages)
          .where(eq(sessionMessages.sessionId, input.id))
          .orderBy(asc(sessionMessages.createdAt));

        return { messages };
      }),
    ),

  /**
   * Send one user message and get Atlas's reply. Validates ownership, runs the
   * engine turn (which records both turns), and returns the assistant text plus
   * whether the session is complete.
   */
  sendMessage: tenantProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        content: z.string().min(1).max(4000),
      }),
    )
    .mutation(({ ctx, input }) =>
      withTenantContext(ctx.session, async (tx) => {
        const [s] = await tx
          .select({ id: sessions.id })
          .from(sessions)
          .where(
            and(
              eq(sessions.id, input.id),
              eq(sessions.userId, ctx.session.userId),
            ),
          );
        if (!s) throw new TRPCError({ code: "NOT_FOUND" });

        try {
          const { assistant, done, captures } = await takeTurn({
            db: tx,
            tenantId: ctx.session.tenantId,
            sessionId: input.id,
            userId: ctx.session.userId,
            userMessage: input.content,
          });
          // `captures` is {id, kind, summary}[] — plan 015 renders these live.
          return { assistant, done, captures };
        } catch (err) {
          mapLlmError(err);
        }
      }),
    ),
});
