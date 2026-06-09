import { router, twistagProcedure } from "../trpc";
import { withTwistagContext } from "@/db/client";
import {
  tenants,
  sprints,
  sprintParticipants,
  opportunities,
} from "@/db/schema";
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
            health,
            completionPct,
            opportunities: opps.length,
            approved,
            engagementLead: "You",
            alert,
          };
        });
      },
    ),
  ),
});
