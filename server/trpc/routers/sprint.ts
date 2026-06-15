import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, and, ne, inArray } from "drizzle-orm";
import { router, tenantProcedure, managerProcedure } from "../trpc";
import { withTenantContext } from "@/db/client";
import { consume } from "@/lib/rate-limit";
import {
  sprints,
  topics,
  sprintParticipants,
  sessions,
  users,
  opportunities,
  tenants,
} from "@/db/schema";
import { generateSynthesisMemo } from "@/services/synthesis/memo";
import type { Db } from "@/db/client";
import {
  loadSprint,
  loadSprintProgress,
  loadSprintPortfolio,
  loadSystemsInventory,
  loadStakeholders,
  loadSynthesisMemo,
} from "@/lib/sprint-read";
import { computeAdoptionRisk } from "@/lib/adoption-risk";
import { TOPIC_TEMPLATES } from "@/lib/topic-templates";
import { LaunchSprintSchema } from "@/lib/schemas";
import { inngest } from "@/services/jobs/client";
import type { ActivityItem } from "@/lib/types";

const idInput = z.object({ id: z.string().uuid() });
const DAY = 86_400_000;

/**
 * Build the board-ready synthesis memo (Ticket G) from the sprint's portfolio,
 * stakeholders, and adoption risk, and cache it on the sprint. Runs under the
 * caller's tenant context (all inputs are tenant-readable). Best-effort: the
 * memo service swallows LLM failures and returns empty fields.
 */
async function buildAndStoreMemo(
  tx: Db,
  sprintId: string,
  tenantId: string,
): Promise<void> {
  const [portfolio, stakeholderRows, adoptionRisk, tenant] = await Promise.all([
    loadSprintPortfolio(tx, sprintId),
    loadStakeholders(tx, sprintId),
    computeAdoptionRisk(tx, sprintId),
    tx
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .then((r) => r[0]),
  ]);
  if (!portfolio || portfolio.items.length === 0) return;

  const memo = await generateSynthesisMemo({
    tenantName: tenant?.name ?? "your organization",
    portfolio: portfolio.items.map((it) => ({
      title: it.title,
      horizon: it.horizon,
      inclusionRationale: it.inclusionRationale,
    })),
    stakeholders: stakeholderRows.map((s) => ({
      roleLabel: s.roleLabel,
      type: s.type,
    })),
    adoptionRisk: adoptionRisk.map((r) => ({
      department: r.department,
      level: r.level,
    })),
  });
  await tx
    .update(sprints)
    .set({ synthesisMemo: memo })
    .where(eq(sprints.id, sprintId));
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
      // Ticket G: generate the board-ready synthesis memo once, at close, and
      // cache it on the sprint. Best-effort — a memo failure never fails close.
      await buildAndStoreMemo(tx, input.id, ctx.session.tenantId).catch(
        () => undefined,
      );
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
   * Queue a nudge to a participant (plan 020, Step 2). The actual send — the 48h
   * per-recipient cooldown, the audit write, and the email — now runs in the
   * `nudge/requested` Inngest worker (services/jobs/functions/nudge-send.ts),
   * which is the sanctioned place for service-role + audit (CLAUDE.md). This
   * procedure stays the trust boundary: it validates the manager, that the
   * recipient + sprint exist in the tenant, that the sprint is ACTIVE (plan 024
   * would add this guard; added here since 024 hasn't landed), and enforces the
   * per-actor volume cap (plan 019) BEFORE enqueueing, so a tripped cap never
   * queues a job. The cooldown is re-checked atomically in the worker.
   *
   * Validation reads run under tenant RLS (withTenantContext), not service role —
   * no service-role bypass remains in this router for email.
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
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.session.tenantId;

      // Tenant-membership + sprint-active checks under RLS (no service role).
      await withTenantContext(ctx.session, async (tx) => {
        const [target] = await tx
          .select({
            id: users.id,
            name: users.name,
            allowNudges: users.allowNudges,
          })
          .from(users)
          .where(eq(users.id, input.userId));
        if (!target) throw new TRPCError({ code: "NOT_FOUND" });

        // Opt-out (plan 025): tell the manager honestly and don't enqueue. The
        // worker re-checks as the authority, but failing here gives immediate,
        // name-specific feedback ("Priya has turned off nudges.").
        if (!target.allowNudges) {
          const firstName = target.name.split(" ")[0];
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `${firstName} has turned off nudges. You can't send them a reminder right now.`,
          });
        }

        const [spr] = await tx
          .select({ status: sprints.status })
          .from(sprints)
          .where(eq(sprints.id, input.sprintId));
        if (!spr) throw new TRPCError({ code: "NOT_FOUND" });
        if (spr.status !== "active") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This sprint isn't active, so there's nothing to nudge about.",
          });
        }
      });

      // Per-actor volume cap (plan 019): 20 nudges / 24h keeps one manager from
      // blasting the whole team. Checked before we enqueue so a tripped cap never
      // queues a job. The per-recipient 48h cooldown is enforced in the worker.
      const actorCap = await consume(`nudge-actor:${ctx.session.userId}`, {
        limit: 20,
        windowSeconds: 86_400,
      });
      if (!actorCap.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message:
            "You've sent a lot of nudges today — Atlas caps these to keep them meaningful. Try again tomorrow.",
        });
      }

      await inngest.send({
        name: "nudge/requested",
        data: {
          tenantId,
          sprintId: input.sprintId,
          userId: input.userId,
          actorId: ctx.session.userId,
          channel: input.channel,
          ...(input.subject ? { subject: input.subject } : {}),
          body: input.body,
        },
      });

      return { queued: true as const };
    }),

  launch: managerProcedure
    .input(LaunchSprintSchema)
    .mutation(async ({ ctx, input }) => {
      const sprintId = await withTenantContext(ctx.session, async (tx) => {
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
      });

      // Post-commit: hand the IC invites to the `sprint/launched` worker
      // (services/jobs/functions/invite-send.ts), which sends one per Inngest
      // step — retried and visible in the dashboard instead of swallowed by a
      // best-effort Promise.allSettled (plan 020, Step 3). A send failure there
      // never undoes the committed launch.
      await inngest.send({
        name: "sprint/launched",
        data: { sprintId, tenantId: ctx.session.tenantId },
      });

      return sprintId;
    }),

  get: tenantProcedure
    .input(idInput)
    .query(({ ctx, input }) =>
      withTenantContext(ctx.session, (tx) => loadSprint(tx, input.id)),
    ),

  progress: tenantProcedure
    .input(idInput)
    .query(({ ctx, input }) =>
      withTenantContext(ctx.session, (tx) => loadSprintProgress(tx, input.id)),
    ),

  /** Per-department adoption-risk heatmap (Ticket E). Role/department only. */
  adoptionRisk: tenantProcedure
    .input(idInput)
    .query(({ ctx, input }) =>
      withTenantContext(ctx.session, (tx) => computeAdoptionRisk(tx, input.id)),
    ),

  /** The curated pilot portfolio for a sprint (Ticket A), or null if none yet. */
  portfolio: tenantProcedure
    .input(idInput)
    .query(({ ctx, input }) =>
      withTenantContext(ctx.session, (tx) => loadSprintPortfolio(tx, input.id)),
    ),

  /** Current-state systems & shadow-IT inventory for a sprint (Ticket F). */
  systemsInventory: tenantProcedure
    .input(idInput)
    .query(({ ctx, input }) =>
      withTenantContext(ctx.session, (tx) =>
        loadSystemsInventory(tx, input.id),
      ),
    ),

  /** Stakeholder map for a sprint (Ticket B). Role labels only. */
  stakeholders: tenantProcedure
    .input(idInput)
    .query(({ ctx, input }) =>
      withTenantContext(ctx.session, (tx) => loadStakeholders(tx, input.id)),
    ),

  /** Cached board-ready synthesis memo for a sprint (Ticket G), or null. */
  synthesisMemo: tenantProcedure
    .input(idInput)
    .query(({ ctx, input }) =>
      withTenantContext(ctx.session, (tx) => loadSynthesisMemo(tx, input.id)),
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
            sprintStatus: sprints.status,
          })
          .from(sprintParticipants)
          .innerJoin(users, eq(sprintParticipants.userId, users.id))
          .innerJoin(sprints, eq(sprintParticipants.sprintId, sprints.id))
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
          sprintStatus: row.sprintStatus,
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
