import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, and } from "drizzle-orm";
import { router, tenantProcedure, managerProcedure } from "../trpc";
import { withTenantContext } from "@/db/client";
import {
  opportunities,
  opportunityEvidence,
  captures,
  users,
  tenants,
  sowDrafts,
} from "@/db/schema";
import { toOpportunity, type OpportunityRow } from "@/lib/dashboard-map";
import { listSprintOpportunities } from "@/lib/sprint-read";
import { buildSowDraft } from "@/lib/sow";
import type { Opportunity, Capture, SowDraft } from "@/lib/types";

export const opportunityRouter = router({
  listForSprint: tenantProcedure
    .input(z.object({ sprintId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      withTenantContext(ctx.session, (tx) =>
        listSprintOpportunities(tx, input.sprintId),
      ),
    ),

  get: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) =>
      withTenantContext(ctx.session, async (tx): Promise<Opportunity> => {
        const [row] = await tx
          .select()
          .from(opportunities)
          .where(eq(opportunities.id, input.id));
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });

        const evRows = await tx
          .select({
            id: captures.id,
            kind: captures.kind,
            summary: captures.summary,
            sourceQuote: captures.sourceQuote,
            tags: captures.tags,
            isEdited: captures.isEdited,
            isRemoved: captures.isRemoved,
            role: users.title,
          })
          .from(opportunityEvidence)
          .innerJoin(captures, eq(opportunityEvidence.captureId, captures.id))
          .innerJoin(users, eq(captures.userId, users.id))
          // Removed captures (IC exercised the 7-day edit window) must never
          // render as evidence — plan 017.
          .where(
            and(
              eq(opportunityEvidence.opportunityId, input.id),
              eq(captures.isRemoved, false),
            ),
          );

        const evidence: Capture[] = evRows.map((e) => ({
          id: e.id,
          kind: e.kind as Capture["kind"],
          summary: e.summary,
          sourceQuote: e.sourceQuote,
          contributorRole: e.role ?? "Contributor",
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
      }),
    ),

  approve: managerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      withTenantContext(
        ctx.session,
        async (tx): Promise<{ status: string; sowDraft: SowDraft }> => {
          const [row] = await tx
            .select()
            .from(opportunities)
            .where(eq(opportunities.id, input.id));
          if (!row) throw new TRPCError({ code: "NOT_FOUND" });

          const [tenant] = await tx
            .select({ name: tenants.name })
            .from(tenants)
            .where(eq(tenants.id, row.tenantId));
          const opp = toOpportunity(row as OpportunityRow, []);
          const sowDraft = buildSowDraft(
            opp,
            tenant?.name ?? "your organization",
          );

          if (row.status === "approved") {
            const [existing] = await tx
              .select()
              .from(sowDrafts)
              .where(eq(sowDrafts.opportunityId, input.id))
              .orderBy(desc(sowDrafts.createdAt))
              .limit(1);
            if (existing) {
              return {
                status: "approved",
                sowDraft: {
                  title: existing.title,
                  scope: existing.scope,
                  inclusions: existing.inclusions,
                  exclusions: existing.exclusions,
                  team: existing.team as SowDraft["team"],
                  durationWeeks: existing.durationWeeks,
                  priceUsd: existing.priceUsd,
                  successMetrics: existing.successMetrics,
                },
              };
            }
            return { status: "approved", sowDraft };
          }

          await tx.insert(sowDrafts).values({
            tenantId: row.tenantId,
            opportunityId: row.id,
            sprintId: row.sprintId,
            title: sowDraft.title,
            scope: sowDraft.scope,
            inclusions: sowDraft.inclusions,
            exclusions: sowDraft.exclusions,
            team: sowDraft.team,
            durationWeeks: sowDraft.durationWeeks,
            priceUsd: sowDraft.priceUsd,
            successMetrics: sowDraft.successMetrics,
            status: "draft",
          });

          await tx
            .update(opportunities)
            .set({
              status: "approved",
              approvedAt: new Date(),
              approvedBy: ctx.session.userId,
            })
            .where(eq(opportunities.id, input.id));

          return { status: "approved", sowDraft };
        },
      ),
    ),
});
