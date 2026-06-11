import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { sessions, sessionMessages, topics, users } from "@/db/schema";
import { complete, type LlmMessage } from "@/services/llm/client";
import { nextArc, isDone, type Arc } from "./state";
import {
  buildSystemPrompt,
  type ConversationRole,
} from "./prompts";

/**
 * The conversation engine: one user turn → one assistant reply, persisted.
 *
 * Pure orchestration over services/llm (the model) and the DB (transcript).
 * Capture extraction is plan 014 — this returns assistant turns only and keeps
 * its return shape stable for 014 to build on.
 *
 * Transcript hygiene (CLAUDE.md "Privacy by design"): this module NEVER logs
 * message content. Nothing here writes content to console.
 *
 * All DB calls take a `db` handle that the caller has already wrapped in
 * withTenantContext, so RLS applies and the inserts run as the owning user.
 */

export type TakeTurnOpts = {
  db: Db;
  tenantId: string;
  sessionId: string;
  userId: string;
  userMessage: string;
};

export type TakeTurnResult = {
  assistant: string;
  arc: Arc;
  done: boolean;
};

const ROLE_FALLBACK: ConversationRole = "ic";

/** Map a users.role value to a conversation role. Unknown roles fall back to IC. */
function toConversationRole(role: string): ConversationRole {
  if (role === "manager") return "manager";
  if (role === "sponsor") return "sponsor";
  return ROLE_FALLBACK;
}

/** How many user turns have been spent in `arc` so far (drives nextArc). */
function userTurnsInArc(
  history: { role: string; arc: string }[],
  arc: Arc,
): number {
  return history.filter((m) => m.role === "user" && m.arc === arc).length;
}

/**
 * Compute the arc the NEXT assistant message belongs to, from the persisted
 * history. With no messages yet we are at INIT → the opener (INTRO). Otherwise
 * we take the arc of the latest assistant message, count the user turns spent
 * in it, and advance per the state machine.
 */
function arcForNextTurn(
  history: { role: string; arc: string }[],
): Arc {
  const lastAssistant = [...history]
    .reverse()
    .find((m) => m.role === "assistant");
  if (!lastAssistant) return nextArc("INIT", 0);
  const currentArc = lastAssistant.arc as Arc;
  return nextArc(currentArc, userTurnsInArc(history, currentArc));
}

type SessionContext = {
  userName: string;
  department: string | null;
  role: ConversationRole;
  topicTitle: string;
  topicDescription: string | null;
};

/** Load the static context a prompt needs: the contributor and the topic. */
async function loadContext(
  db: Db,
  sessionId: string,
): Promise<SessionContext | null> {
  const [row] = await db
    .select({
      userName: users.name,
      department: users.department,
      userRole: users.role,
      topicTitle: topics.title,
      topicDescription: topics.description,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .leftJoin(topics, eq(sessions.topicId, topics.id))
    .where(eq(sessions.id, sessionId));
  if (!row) return null;
  return {
    userName: row.userName,
    department: row.department,
    role: toConversationRole(row.userRole),
    topicTitle: row.topicTitle ?? "Discovery session",
    topicDescription: row.topicDescription,
  };
}

/** Ordered transcript for a session (RLS already scopes to the owner). */
async function loadHistory(
  db: Db,
  sessionId: string,
): Promise<{ role: string; content: string; arc: string }[]> {
  return db
    .select({
      role: sessionMessages.role,
      content: sessionMessages.content,
      arc: sessionMessages.arc,
    })
    .from(sessionMessages)
    .where(eq(sessionMessages.sessionId, sessionId))
    .orderBy(asc(sessionMessages.createdAt));
}

/**
 * Produce the opening assistant message for a session that has no messages yet.
 * Persists only the assistant turn (there is no user turn before the opener) and
 * increments messages_count.
 */
export async function openSession(
  opts: Omit<TakeTurnOpts, "userMessage">,
): Promise<TakeTurnResult> {
  const ctx = await loadContext(opts.db, opts.sessionId);
  if (!ctx) throw new Error("Session not found or not readable");

  const arc = nextArc("INIT", 0); // INTRO
  const system = buildSystemPrompt({
    role: ctx.role,
    userName: ctx.userName,
    department: ctx.department,
    topicTitle: ctx.topicTitle,
    topicDescription: ctx.topicDescription,
    arc,
  });

  const assistant = await complete({
    system,
    messages: [
      {
        role: "user",
        content:
          "Begin the session now with your opening message and first question.",
      },
    ],
  });

  await persistTurns(opts, arc, [{ role: "assistant", content: assistant }]);
  return { assistant, arc, done: isDone(arc) };
}

/**
 * Take one conversational turn: record the user message, generate the assistant
 * reply via the LLM, record it, and advance message_count — all in one
 * transaction-scoped DB handle.
 */
export async function takeTurn(opts: TakeTurnOpts): Promise<TakeTurnResult> {
  const ctx = await loadContext(opts.db, opts.sessionId);
  if (!ctx) throw new Error("Session not found or not readable");

  const history = await loadHistory(opts.db, opts.sessionId);
  const arc = arcForNextTurn(history);

  const system = buildSystemPrompt({
    role: ctx.role,
    userName: ctx.userName,
    department: ctx.department,
    topicTitle: ctx.topicTitle,
    topicDescription: ctx.topicDescription,
    arc,
  });

  const llmHistory: LlmMessage[] = history.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));
  llmHistory.push({ role: "user", content: opts.userMessage });

  const assistant = await complete({ system, messages: llmHistory });

  await persistTurns(opts, arc, [
    { role: "user", content: opts.userMessage },
    { role: "assistant", content: assistant },
  ]);

  return { assistant, arc, done: isDone(arc) };
}

/** Insert the given turns under one arc and bump sessions.messages_count. */
async function persistTurns(
  opts: Omit<TakeTurnOpts, "userMessage">,
  arc: Arc,
  turns: { role: "user" | "assistant"; content: string }[],
): Promise<void> {
  await opts.db.insert(sessionMessages).values(
    turns.map((t) => ({
      tenantId: opts.tenantId,
      sessionId: opts.sessionId,
      userId: opts.userId,
      role: t.role,
      content: t.content,
      arc,
    })),
  );
  await opts.db
    .update(sessions)
    .set({ messagesCount: sql`${sessions.messagesCount} + ${turns.length}` })
    .where(
      and(eq(sessions.id, opts.sessionId), eq(sessions.userId, opts.userId)),
    );
}
