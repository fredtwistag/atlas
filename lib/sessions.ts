/**
 * Session lifecycle core — completing a discovery session. Kept out of the
 * "use server" action file so it is directly unit/integration-testable.
 * Server-only (uses the DB client + tenant RLS).
 */
import { and, eq } from "drizzle-orm";
import { withTenantContext, type TenantClaims } from "@/db/client";
import { sessions, sprintParticipants } from "@/db/schema";

const WEEK_MS = 7 * 86_400_000;

/**
 * Mark `sessionId` complete for the signed-in user, set the 7-day edit window,
 * and recompute that participant's progress. Throws if the session isn't the
 * user's (RLS scopes the tenant; the user_id predicate scopes ownership).
 */
export async function completeSessionForUser(
  claims: TenantClaims,
  sessionId: string,
): Promise<void> {
  await withTenantContext(claims, async (tx) => {
    const now = new Date();
    const editEnds = new Date(now.getTime() + WEEK_MS);

    const updated = await tx
      .update(sessions)
      .set({
        status: "completed",
        completedAt: now,
        editWindowEndsAt: editEnds,
      })
      .where(
        and(eq(sessions.id, sessionId), eq(sessions.userId, claims.userId)),
      )
      .returning({ sprintId: sessions.sprintId });

    if (updated.length === 0) {
      throw new Error("Session not found for this user.");
    }
    const sprintId = updated[0].sprintId;

    const completed = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.sprintId, sprintId),
          eq(sessions.userId, claims.userId),
          eq(sessions.status, "completed"),
        ),
      );

    const [part] = await tx
      .select({ total: sprintParticipants.sessionsTotal })
      .from(sprintParticipants)
      .where(
        and(
          eq(sprintParticipants.sprintId, sprintId),
          eq(sprintParticipants.userId, claims.userId),
        ),
      );

    const count = completed.length;
    const status = part && count >= part.total ? "completed" : "in_progress";

    await tx
      .update(sprintParticipants)
      .set({ sessionsCompleted: count, status })
      .where(
        and(
          eq(sprintParticipants.sprintId, sprintId),
          eq(sprintParticipants.userId, claims.userId),
        ),
      );
  });
}
