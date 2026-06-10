import { createElement } from "react";
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
  auditLog,
} from "@/db/schema";
import { loadSprint, loadSprintProgress } from "@/lib/sprint-read";
import { TOPIC_TEMPLATES } from "@/lib/topic-templates";
import { LaunchSprintSchema } from "@/lib/schemas";
import { appUrl } from "@/lib/app-url";
import { generateInviteLink } from "@/services/email/invite-link";
import { sendEmail } from "@/services/email/send";
import { InviteEmail, inviteSubject } from "@/emails/InviteEmail";
import { NudgeEmail } from "@/emails/NudgeEmail";
import type { ActivityItem } from "@/lib/types";

const idInput = z.object({ id: z.string().uuid() });
const DAY = 86_400_000;

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
   * Send a nudge to a participant. Audited, with a 48-hour per-person cooldown.
   * Runs as service_role so it can both read the audit trail and write to it;
   * every check is explicitly tenant-scoped since RLS is bypassed. The email is
   * sent INSIDE the transaction so a delivery failure rolls back the audit row
   * and the cooldown isn't burned without a message actually going out.
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
            .select({ id: users.id, email: users.email, name: users.name })
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

          // Email channel only (Slack is v1.5). A throw here rolls the tx back.
          if (input.channel === "email") {
            const [sender] = await tx
              .select({ name: users.name })
              .from(users)
              .where(
                and(
                  eq(users.id, ctx.session.userId),
                  eq(users.tenantId, tenantId),
                ),
              );
            const [tenant] = await tx
              .select({ name: tenants.name })
              .from(tenants)
              .where(eq(tenants.id, tenantId));
            await sendEmail({
              to: target.email,
              subject: input.subject ?? "A quick nudge on your Atlas sessions",
              react: createElement(NudgeEmail, {
                senderName: sender?.name ?? "Your manager",
                orgName: tenant?.name ?? "Atlas",
                body: input.body,
                ctaUrl: `${appUrl()}/me`,
              }),
            });
          }

          return { ok: true as const };
        },
      ),
    ),

  launch: managerProcedure
    .input(LaunchSprintSchema)
    .mutation(async ({ ctx, input }) => {
      const launched = await withTenantContext(ctx.session, async (tx) => {
        const selectedTemplates = TOPIC_TEMPLATES.filter((t) =>
          input.topicKeys.includes(t.key),
        );
        if (selectedTemplates.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Pick at least one topic.",
          });
        }

        // Selected members (for sponsorId, scope_department, and IC invites).
        const members = await tx
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
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

        const [tenant] = await tx
          .select({ name: tenants.name })
          .from(tenants)
          .where(eq(tenants.id, ctx.session.tenantId));
        const [manager] = await tx
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, ctx.session.userId));

        return {
          sprintId: sprint.id,
          ics: members
            .filter((m) => m.role === "ic")
            .map((m) => ({ email: m.email, name: m.name })),
          orgName: tenant?.name ?? "your organization",
          inviterName: manager?.name ?? "Your manager",
          topics: selectedTemplates.map((t) => ({
            title: t.title,
            estMinutes: t.estMinutes,
          })),
        };
      });

      // Post-commit, best-effort: tell each IC their sprint is live, with a
      // topic preview. A failed send never undoes the launch (#3 / ATL-203).
      await Promise.allSettled(
        launched.ics.map(async (ic) => {
          const confirmUrl = await generateInviteLink(ic.email);
          await sendEmail({
            to: ic.email,
            subject: inviteSubject(
              "ic",
              launched.inviterName,
              launched.orgName,
            ),
            react: createElement(InviteEmail, {
              role: "ic",
              orgName: launched.orgName,
              inviterName: launched.inviterName,
              confirmUrl,
              topics: launched.topics,
            }),
          });
        }),
      );

      return launched.sprintId;
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
