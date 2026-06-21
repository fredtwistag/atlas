import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, ne, lt, gte, lte, like, sql } from "drizzle-orm";
import { router, twistagProcedure } from "../trpc";
import { withTwistagContext, withServiceRole } from "@/db/client";
import {
  tenants,
  sprints,
  sprintParticipants,
  opportunities,
  users,
  invitations,
  sowDrafts,
  auditLog,
  companyContext,
} from "@/db/schema";
import {
  loadSprint,
  loadSprintProgress,
  listSprintOpportunities,
  loadSynthesisMemo,
  loadOpportunityDetail,
} from "@/lib/sprint-read";
import {
  updateOpportunity,
  setOpportunityStatus,
  enrichCompany,
  approveCompanyContext,
  ingestDocument,
} from "@/lib/twistag-admin";
import { recompute as recomputeOpportunities } from "@/services/opportunity/recompute";
import type { ClientSummary } from "@/lib/types";

export const twistagRouter = router({
  clientList: twistagProcedure.query(({ ctx }) =>
    withTwistagContext(
      { twistagRole: ctx.session.twistagRole, actor: ctx.session.userId },
      async (tx): Promise<ClientSummary[]> => {
        const [tenantRows, sprintRows, partRows, oppRows] = await Promise.all([
          tx.select().from(tenants),
          tx.select().from(sprints),
          tx.select().from(sprintParticipants),
          tx
            .select({
              sprintId: opportunities.sprintId,
              status: opportunities.status,
            })
            .from(opportunities),
        ]);

        return tenantRows.map((t): ClientSummary => {
          // Most recent active sprint for this tenant.
          const tenantSprints = sprintRows
            .filter((s) => s.tenantId === t.id && s.status === "active")
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
            );
          const sprint = tenantSprints[0];

          const parts = sprint
            ? partRows.filter((p) => p.sprintId === sprint.id)
            : [];
          const done = parts.reduce((s, p) => s + p.sessionsCompleted, 0);
          const total = parts.reduce((s, p) => s + p.sessionsTotal, 0);
          const completionPct = total ? Math.round((done / total) * 100) : 0;

          const opps = sprint
            ? oppRows.filter((o) => o.sprintId === sprint.id)
            : [];
          const approved = opps.filter((o) => o.status === "approved").length;

          const health: ClientSummary["health"] = !sprint
            ? "at_risk"
            : completionPct >= 60
              ? "healthy"
              : completionPct >= 30
                ? "watch"
                : "at_risk";

          const alert = !sprint
            ? "No sprint launched yet"
            : health === "healthy"
              ? undefined
              : `Participation at ${completionPct}% — ${done}/${total} sessions complete`;

          return {
            tenantId: t.id,
            name: t.name,
            segment: t.segment,
            sprintName: sprint?.name ?? "No active sprint",
            sprintId: sprint?.id ?? null,
            health,
            completionPct,
            opportunities: opps.length,
            approved,
            alert,
          };
        });
      },
    ),
  ),

  /**
   * Full company drill-down for one tenant: profile, members, pending invites,
   * and a per-sprint summary. One `withTwistagContext` call (one audited read).
   * No captures/quotes — aggregates and metadata only (privacy by design).
   */
  clientDetail: twistagProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      withTwistagContext(
        {
          twistagRole: ctx.session.twistagRole,
          actor: ctx.session.userId,
          tenantId: input.tenantId,
        },
        async (tx) => {
          const [tenant] = await tx
            .select({
              id: tenants.id,
              slug: tenants.slug,
              name: tenants.name,
              segment: tenants.segment,
              status: tenants.status,
              domain: tenants.domain,
              currency: tenants.currency,
              createdAt: tenants.createdAt,
            })
            .from(tenants)
            .where(eq(tenants.id, input.tenantId));
          if (!tenant) throw new TRPCError({ code: "NOT_FOUND" });

          const [
            members,
            pendingInvitations,
            sprintRows,
            partRows,
            oppRows,
            sowRows,
          ] = await Promise.all([
            tx
              .select({
                id: users.id,
                name: users.name,
                email: users.email,
                role: users.role,
                title: users.title,
                department: users.department,
              })
              .from(users)
              .where(eq(users.tenantId, input.tenantId)),
            tx
              .select({
                id: invitations.id,
                email: invitations.email,
                role: invitations.role,
                createdAt: invitations.createdAt,
              })
              .from(invitations)
              .where(
                and(
                  eq(invitations.tenantId, input.tenantId),
                  eq(invitations.status, "pending"),
                ),
              ),
            tx
              .select()
              .from(sprints)
              .where(eq(sprints.tenantId, input.tenantId))
              .orderBy(desc(sprints.createdAt)),
            tx
              .select({
                sprintId: sprintParticipants.sprintId,
                sessionsCompleted: sprintParticipants.sessionsCompleted,
                sessionsTotal: sprintParticipants.sessionsTotal,
              })
              .from(sprintParticipants)
              .where(eq(sprintParticipants.tenantId, input.tenantId)),
            tx
              .select({
                id: opportunities.id,
                sprintId: opportunities.sprintId,
                title: opportunities.title,
                description: opportunities.description,
                rationale: opportunities.rationale,
                impactLow: opportunities.impactLow,
                impactHigh: opportunities.impactHigh,
                compositeScore: opportunities.compositeScore,
                status: opportunities.status,
              })
              .from(opportunities)
              .where(eq(opportunities.tenantId, input.tenantId))
              .orderBy(desc(opportunities.compositeScore)),
            tx
              .select({
                opportunityId: sowDrafts.opportunityId,
                sprintId: sowDrafts.sprintId,
                status: sowDrafts.status,
                createdAt: sowDrafts.createdAt,
              })
              .from(sowDrafts)
              .where(eq(sowDrafts.tenantId, input.tenantId)),
          ]);

          // Latest SOW draft status per opportunity (drafts can be regenerated).
          const sowByOpp = new Map<string, { status: string; at: number }>();
          for (const d of sowRows) {
            const at = new Date(d.createdAt).getTime();
            const prev = sowByOpp.get(d.opportunityId);
            if (!prev || at > prev.at)
              sowByOpp.set(d.opportunityId, { status: d.status, at });
          }
          const opportunitiesOut = oppRows.map((o) => ({
            id: o.id,
            sprintId: o.sprintId,
            title: o.title,
            description: o.description,
            rationale: o.rationale,
            impactLow: o.impactLow,
            impactHigh: o.impactHigh,
            compositeScore: Number(o.compositeScore),
            status: o.status,
            sowStatus: sowByOpp.get(o.id)?.status ?? null,
          }));

          const sprintSummaries = sprintRows.map((s) => {
            const parts = partRows.filter((p) => p.sprintId === s.id);
            const done = parts.reduce((a, p) => a + p.sessionsCompleted, 0);
            const total = parts.reduce((a, p) => a + p.sessionsTotal, 0);
            const opps = oppRows.filter((o) => o.sprintId === s.id);
            return {
              id: s.id,
              name: s.name,
              status: s.status,
              startDate: s.startDate,
              endDate: s.endDate,
              completionPct: total ? Math.round((done / total) * 100) : 0,
              participantCount: parts.length,
              opportunityCount: opps.length,
              approvedCount: opps.filter((o) => o.status === "approved").length,
              sowDraftStatuses: sowRows
                .filter((d) => d.sprintId === s.id)
                .map((d) => d.status),
            };
          });

          return {
            tenant,
            members,
            pendingInvitations,
            sprints: sprintSummaries,
            opportunities: opportunitiesOut,
          };
        },
      ),
    ),

  /**
   * Read-only sprint view powering the Twistag report. Mirrors the sponsor's
   * report contract (sprint + progress + opportunities + synthesis memo) so the
   * admin sees the same page. Returns the sprint's `tenantId` so the route can
   * verify it matches the URL tenant.
   */
  sprintView: twistagProcedure
    .input(z.object({ sprintId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      withTwistagContext(
        {
          twistagRole: ctx.session.twistagRole,
          actor: ctx.session.userId,
          targetId: input.sprintId,
        },
        async (tx) => {
          const [row] = await tx
            .select({ tenantId: sprints.tenantId })
            .from(sprints)
            .where(eq(sprints.id, input.sprintId));
          if (!row) throw new TRPCError({ code: "NOT_FOUND" });
          const [sprint, progress, opportunities, memo] = await Promise.all([
            loadSprint(tx, input.sprintId),
            loadSprintProgress(tx, input.sprintId),
            listSprintOpportunities(tx, input.sprintId),
            loadSynthesisMemo(tx, input.sprintId),
          ]);
          return {
            tenantId: row.tenantId,
            sprint,
            progress,
            opportunities,
            memo,
          };
        },
      ),
    ),

  /**
   * Read-only opportunity drill-down powering the Twistag admin's evidence view
   * — the same `OpportunityDetail` the sponsor/manager sees, minus the approve
   * action (approval stays with the client). Returns the opportunity's
   * `tenantId`/`sprintId` so the route can verify them against the URL.
   */
  opportunityView: twistagProcedure
    .input(z.object({ opportunityId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      withTwistagContext(
        {
          twistagRole: ctx.session.twistagRole,
          actor: ctx.session.userId,
          targetId: input.opportunityId,
        },
        async (tx) => {
          const [meta] = await tx
            .select({
              tenantId: opportunities.tenantId,
              sprintId: opportunities.sprintId,
            })
            .from(opportunities)
            .where(eq(opportunities.id, input.opportunityId));
          if (!meta) throw new TRPCError({ code: "NOT_FOUND" });
          const opp = await loadOpportunityDetail(tx, input.opportunityId);
          return { tenantId: meta.tenantId, sprintId: meta.sprintId, opp };
        },
      ),
    ),

  /**
   * Audit log viewer. Reads via service_role (authenticated has no audit_log
   * grant). Filters are all optional; `twistag.read` rows are hidden unless
   * `includeReads`. Keyset-paginated by id desc. Logs its own view.
   */
  auditLog: twistagProcedure
    .input(
      z.object({
        tenantId: z.string().uuid().optional(),
        action: z.string().max(100).optional(),
        actor: z.string().max(200).optional(),
        includeReads: z.boolean().default(false),
        from: z.string().optional(),
        to: z.string().optional(),
        cursor: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(({ ctx, input }) =>
      withServiceRole(
        {
          action: "twistag.audit.view",
          actor: ctx.session.userId,
          metadata: { twistag_role: ctx.session.twistagRole },
        },
        async (tx) => {
          const conds = [];
          if (input.tenantId) conds.push(eq(auditLog.tenantId, input.tenantId));
          if (input.action)
            conds.push(like(auditLog.action, input.action + "%"));
          if (input.actor)
            conds.push(sql`${auditLog.metadata} ->> 'actor' = ${input.actor}`);
          if (!input.includeReads)
            conds.push(ne(auditLog.action, "twistag.read"));
          if (input.from) conds.push(gte(auditLog.at, new Date(input.from)));
          if (input.to) conds.push(lte(auditLog.at, new Date(input.to)));
          if (input.cursor) conds.push(lt(auditLog.id, input.cursor));

          const rows = await tx
            .select()
            .from(auditLog)
            .where(conds.length ? and(...conds) : undefined)
            .orderBy(desc(auditLog.id))
            .limit(input.limit + 1);

          const hasMore = rows.length > input.limit;
          const page = hasMore ? rows.slice(0, input.limit) : rows;
          return {
            rows: page,
            nextCursor: hasMore ? page[page.length - 1].id : null,
          };
        },
      ),
    ),

  /**
   * Close a sprint (ops control). Resolves the sprint's tenant via a twistag
   * read first (NOT_FOUND if missing), then updates as service_role with the
   * update explicitly scoped to that tenant, audited with tenantId + targetId.
   */
  sprintClose: twistagProcedure
    .input(z.object({ sprintId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const found = await withTwistagContext(
        {
          twistagRole: ctx.session.twistagRole,
          actor: ctx.session.userId,
          targetId: input.sprintId,
        },
        async (tx) => {
          const [s] = await tx
            .select({ tenantId: sprints.tenantId, status: sprints.status })
            .from(sprints)
            .where(eq(sprints.id, input.sprintId));
          return s ?? null;
        },
      );
      if (!found) throw new TRPCError({ code: "NOT_FOUND" });

      return withServiceRole(
        {
          action: "twistag.sprint.close",
          actor: ctx.session.userId,
          tenantId: found.tenantId,
          targetId: input.sprintId,
          metadata: {
            twistag_role: ctx.session.twistagRole,
            previousStatus: found.status,
          },
        },
        async (tx) => {
          await tx
            .update(sprints)
            .set({ status: "completed", closedAt: new Date() })
            .where(
              and(
                eq(sprints.id, input.sprintId),
                eq(sprints.tenantId, found.tenantId),
              ),
            );
          return {
            id: input.sprintId,
            tenantId: found.tenantId,
            status: "completed" as const,
          };
        },
      );
    }),

  /**
   * Plan 016 Step 5 — recompute a sprint's opportunities from its captures.
   * Resolves the sprint's tenant via a twistag read first (NOT_FOUND if
   * missing), then runs the engine (cluster → score → upsert). `recompute`
   * itself runs as service_role and writes its own audit row; the twistag read
   * above adds the cross-tenant access record.
   */
  recompute: twistagProcedure
    .input(z.object({ sprintId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const found = await withTwistagContext(
        {
          twistagRole: ctx.session.twistagRole,
          actor: ctx.session.userId,
          targetId: input.sprintId,
        },
        async (tx) => {
          const [s] = await tx
            .select({ tenantId: sprints.tenantId })
            .from(sprints)
            .where(eq(sprints.id, input.sprintId));
          return s ?? null;
        },
      );
      if (!found) throw new TRPCError({ code: "NOT_FOUND" });
      return recomputeOpportunities(input.sprintId, ctx.session.userId);
    }),

  /**
   * Plan 016 Step 6 — curation: edit an opportunity's curatable fields. The
   * tenant is resolved from the opportunity via a twistag read (NOT_FOUND if
   * missing); the edit refuses approved rows inside updateOpportunity.
   */
  /** Read a tenant's company context for the admin panel (CTX-1/2/3). */
  companyContext: twistagProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      withTwistagContext(
        {
          twistagRole: ctx.session.twistagRole,
          actor: ctx.session.userId,
          tenantId: input.tenantId,
        },
        async (tx) => {
          const [row] = await tx
            .select()
            .from(companyContext)
            .where(eq(companyContext.tenantId, input.tenantId));
          return row ?? null;
        },
      ),
    ),

  /** CTX-2: enrich a tenant's company context from the public web (→ draft). */
  enrichCompany: twistagProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await enrichCompany(
        { userId: ctx.session.userId, twistagRole: ctx.session.twistagRole },
        input.tenantId,
      );
      return { ok: true as const };
    }),

  /** CTX-2: approve a draft company context so CTX-4 starts injecting it. */
  approveCompanyContext: twistagProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await approveCompanyContext(
        { userId: ctx.session.userId, twistagRole: ctx.session.twistagRole },
        input.tenantId,
      );
      return { ok: true as const };
    }),

  /** CTX-3: ingest an uploaded text artifact into the company context (draft). */
  ingestDocument: twistagProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        filename: z.string().min(1).max(255),
        mimeType: z.string().min(1).max(160),
        text: z.string().min(1).max(200_000),
        sprintId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ingestDocument(
        { userId: ctx.session.userId, twistagRole: ctx.session.twistagRole },
        input,
      );
    }),

  opportunityUpdate: twistagProcedure
    .input(
      z.object({
        opportunityId: z.string().uuid(),
        title: z.string().min(5).max(140).optional(),
        description: z.string().min(10).max(600).optional(),
        rationale: z.string().min(10).max(1600).optional(),
        impactLow: z.number().int().min(0).optional(),
        impactHigh: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = await resolveOpportunityTenant(ctx, input.opportunityId);
      await updateOpportunity(
        { userId: ctx.session.userId, twistagRole: ctx.session.twistagRole },
        tenantId,
        input.opportunityId,
        {
          title: input.title,
          description: input.description,
          rationale: input.rationale,
          impactLow: input.impactLow,
          impactHigh: input.impactHigh,
        },
      );
      return { ok: true as const };
    }),

  /**
   * Plan 016 Step 6 — curation: move an opportunity between provisional /
   * surfaced / hidden. Refuses approved rows inside setOpportunityStatus.
   */
  opportunitySetStatus: twistagProcedure
    .input(
      z.object({
        opportunityId: z.string().uuid(),
        status: z.enum(["provisional", "surfaced", "hidden"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = await resolveOpportunityTenant(ctx, input.opportunityId);
      await setOpportunityStatus(
        { userId: ctx.session.userId, twistagRole: ctx.session.twistagRole },
        tenantId,
        input.opportunityId,
        input.status,
      );
      return { ok: true as const };
    }),
});

/**
 * Resolve an opportunity's tenant via a twistag cross-tenant read (audited).
 * Used by the curation mutations so the subsequent service-role write is
 * explicitly tenant-scoped. Throws NOT_FOUND if the opportunity is unknown.
 */
async function resolveOpportunityTenant(
  ctx: { session: { twistagRole: string; userId: string } },
  opportunityId: string,
): Promise<string> {
  const found = await withTwistagContext(
    {
      twistagRole: ctx.session.twistagRole,
      actor: ctx.session.userId,
      targetId: opportunityId,
    },
    async (tx) => {
      const [o] = await tx
        .select({ tenantId: opportunities.tenantId })
        .from(opportunities)
        .where(eq(opportunities.id, opportunityId));
      return o ?? null;
    },
  );
  if (!found) throw new TRPCError({ code: "NOT_FOUND" });
  return found.tenantId;
}
