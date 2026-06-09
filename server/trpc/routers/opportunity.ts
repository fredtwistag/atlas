import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc } from "drizzle-orm";
import { router, tenantProcedure } from "../trpc";
import { withTenantContext } from "@/db/client";
import {
  opportunities,
  opportunityEvidence,
  captures,
  users,
} from "@/db/schema";
import { toOpportunity, type OpportunityRow } from "@/lib/dashboard-map";
import type { Opportunity, Capture } from "@/lib/types";

export const opportunityRouter = router({
  listForSprint: tenantProcedure
    .input(z.object({ sprintId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      withTenantContext(ctx.session, async (tx): Promise<Opportunity[]> => {
        const rows = await tx
          .select()
          .from(opportunities)
          .where(eq(opportunities.sprintId, input.sprintId))
          .orderBy(desc(opportunities.compositeScore));
        return rows.map((r) => toOpportunity(r as OpportunityRow, []));
      }),
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
          .where(eq(opportunityEvidence.opportunityId, input.id));

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

        return toOpportunity(row as OpportunityRow, evidence);
      }),
    ),
});
