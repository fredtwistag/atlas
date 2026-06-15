/**
 * Session lifecycle core — completing a discovery session. Kept out of the
 * "use server" action file so it is directly unit/integration-testable.
 * Server-only (uses the DB client + tenant RLS).
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { log } from "@/lib/log";
import {
  withServiceRole,
  withTenantContext,
  type Db,
  type TenantClaims,
} from "@/db/client";
import {
  captures,
  sessions,
  sessionMessages,
  sprintParticipants,
  topics,
} from "@/db/schema";
import { LlmNotConfiguredError, LlmOutputError } from "@/services/llm/client";
import { extractFromSession } from "@/services/conversation/extract";
import { inngest } from "@/services/jobs/client";

const WEEK_MS = 7 * 86_400_000;

/**
 * Plan 020, Step 4 fallback flag. When set truthy, completion runs the final
 * extraction sweep INLINE (the pre-020 behavior) instead of emitting
 * `session/completed` for the Inngest worker. Kept so the inline path stays one
 * env flip away until the async path is verified in dev. Default (unset) = async
 * via the worker, which also debounces the opportunity recompute.
 */
function inlineExtractionEnabled(): boolean {
  return process.env.ATLAS_INLINE_SESSION_EXTRACTION === "1";
}

/**
 * Mark `sessionId` complete for the signed-in user, set the 7-day edit window,
 * stamp `totalSeconds`, run a final whole-transcript extraction sweep, and
 * recompute that participant's progress. Throws if the session isn't the
 * user's (RLS scopes the tenant; the user_id predicate scopes ownership).
 *
 * Final extraction + opportunity recompute now run in the `session/completed`
 * Inngest worker (services/jobs/functions/session-completed.ts) by default; the
 * event is emitted AFTER this transaction commits. Set
 * `ATLAS_INLINE_SESSION_EXTRACTION=1` to keep extraction inline as a fallback.
 */
export async function completeSessionForUser(
  claims: TenantClaims,
  sessionId: string,
): Promise<void> {
  const result = await withTenantContext(claims, async (tx) => {
    const now = new Date();
    const editEnds = new Date(now.getTime() + WEEK_MS);

    // Wall-clock duration of the conversation, derived from the transcript so
    // completion stays self-contained (the UI does not supply elapsed time).
    const transcript = await tx
      .select({
        role: sessionMessages.role,
        content: sessionMessages.content,
        createdAt: sessionMessages.createdAt,
      })
      .from(sessionMessages)
      .where(
        and(
          eq(sessionMessages.sessionId, sessionId),
          eq(sessionMessages.userId, claims.userId),
        ),
      )
      .orderBy(asc(sessionMessages.createdAt));
    const totalSeconds = durationSeconds(transcript.map((m) => m.createdAt));

    const updated = await tx
      .update(sessions)
      .set({
        status: "completed",
        completedAt: now,
        editWindowEndsAt: editEnds,
        totalSeconds,
      })
      .where(
        and(eq(sessions.id, sessionId), eq(sessions.userId, claims.userId)),
      )
      .returning({
        sprintId: sessions.sprintId,
        tenantId: sessions.tenantId,
        topicId: sessions.topicId,
      });

    if (updated.length === 0) {
      throw new Error("Session not found for this user.");
    }
    const sprintId = updated[0].sprintId;
    const tenantId = updated[0].tenantId;

    // Fallback path: run the sweep inline in the same tx (pre-020 behavior).
    // Default path leaves it to the worker (emitted after commit, below).
    if (inlineExtractionEnabled()) {
      await finalExtraction(tx, {
        tenantId,
        sessionId,
        userId: claims.userId,
        topicId: updated[0].topicId,
        turns: transcript.map((m) => ({ role: m.role, content: m.content })),
      });
    }

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

    return { sprintId, tenantId };
  });

  // Default async path (Step 4): the worker runs the final extraction sweep +
  // a debounced opportunity recompute. Emitted AFTER the tx commits so the
  // worker reads a consistent session. Skipped when the inline fallback ran.
  if (!inlineExtractionEnabled()) {
    await inngest.send({
      name: "session/completed",
      data: { sessionId, tenantId: result.tenantId },
    });
  }
}

/** Seconds between the first and last transcript timestamp (0 if <2 turns). */
function durationSeconds(timestamps: Date[]): number {
  if (timestamps.length < 2) return 0;
  const first = timestamps[0].getTime();
  const last = timestamps[timestamps.length - 1].getTime();
  return Math.max(0, Math.round((last - first) / 1000));
}

/**
 * Final whole-transcript extraction sweep at completion. Runs in the same tx so
 * the captures land under the user's RLS context. Deduplicates against captures
 * already on the session by a case-insensitive `summary` match (the per-turn
 * passes already captured most of these), and bumps `captureCount` by the
 * number of genuinely-new rows inserted.
 *
 * Best-effort: extraction failure (bad output / unconfigured) must not fail
 * completion — we log a COUNT only, never capture content (CLAUDE.md privacy).
 */
async function finalExtraction(
  tx: Db,
  opts: {
    tenantId: string;
    sessionId: string;
    userId: string;
    topicId: string | null;
    turns: { role: string; content: string }[];
  },
): Promise<void> {
  let topicTitle = "Discovery session";
  if (opts.topicId) {
    const [t] = await tx
      .select({ title: topics.title })
      .from(topics)
      .where(eq(topics.id, opts.topicId));
    if (t) topicTitle = t.title;
  }

  let items;
  try {
    items = await extractFromSession({ topicTitle, turns: opts.turns });
  } catch (err) {
    if (err instanceof LlmOutputError || err instanceof LlmNotConfiguredError) {
      // Best-effort final extraction: content-free structured warn (plan 023).
      // The underlying LLM transport failure, if any, was already captured in
      // services/llm/client; a real non-typed bug rethrows below.
      log.warn("conversation.extract.final.failed", { captured: 0 });
      return;
    }
    throw err;
  }
  if (items.length === 0) return;

  const existing = await tx
    .select({ summary: captures.summary })
    .from(captures)
    .where(eq(captures.sessionId, opts.sessionId));
  const seen = new Set(existing.map((c) => c.summary.toLowerCase().trim()));

  const fresh = items.filter((c) => !seen.has(c.summary.toLowerCase().trim()));
  if (fresh.length === 0) return;

  await tx.insert(captures).values(
    fresh.map((c) => ({
      tenantId: opts.tenantId,
      sessionId: opts.sessionId,
      userId: opts.userId,
      kind: c.kind,
      summary: c.summary,
      sourceQuote: c.sourceQuote,
      tags: c.tags,
    })),
  );

  await tx
    .update(sessions)
    .set({ captureCount: sql`${sessions.captureCount} + ${fresh.length}` })
    .where(
      and(eq(sessions.id, opts.sessionId), eq(sessions.userId, opts.userId)),
    );
}

/**
 * Service-role entry point for the `session/completed` worker (plan 020 Step 4).
 * Loads the session's owner, topic, and transcript, then runs the same
 * dedupe-aware `finalExtraction` sweep — under `withServiceRole`, the sanctioned
 * worker context (CLAUDE.md), since the job has no user JWT. Idempotent against
 * re-runs because `finalExtraction` dedupes by `summary` against existing
 * captures, so a retried event won't double-insert.
 *
 * Returns the sprintId so the caller can chain a recompute. Returns null if the
 * session no longer exists. Never logs capture content.
 */
export async function runFinalExtractionForSession(
  sessionId: string,
  tenantId: string,
): Promise<{ sprintId: string } | null> {
  return withServiceRole(
    { action: "session.extract.final", actor: "system", tenantId },
    async (tx) => {
      const [s] = await tx
        .select({
          userId: sessions.userId,
          sprintId: sessions.sprintId,
          topicId: sessions.topicId,
        })
        .from(sessions)
        .where(
          and(eq(sessions.id, sessionId), eq(sessions.tenantId, tenantId)),
        );
      if (!s) return null;

      const transcript = await tx
        .select({
          role: sessionMessages.role,
          content: sessionMessages.content,
        })
        .from(sessionMessages)
        .where(eq(sessionMessages.sessionId, sessionId))
        .orderBy(asc(sessionMessages.createdAt));

      await finalExtraction(tx, {
        tenantId,
        sessionId,
        userId: s.userId,
        topicId: s.topicId,
        turns: transcript.map((m) => ({ role: m.role, content: m.content })),
      });

      return { sprintId: s.sprintId };
    },
  );
}
