import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { log } from "@/lib/log";
import {
  captures,
  companyContext,
  sessions,
  sessionMessages,
  tenants,
  topics,
  users,
} from "@/db/schema";
import {
  complete,
  LlmNotConfiguredError,
  LlmOutputError,
  type LlmMessage,
} from "@/services/llm/client";
import type { CapturedItem } from "@/services/llm/schemas";
import {
  arcIndex,
  arcName,
  nextArc,
  isDone,
  probesRemaining,
  type Arc,
} from "./state";
import { extractFromTurn } from "./extract";
import {
  buildSystemPrompt,
  type ConversationRole,
  type PromptCompanyContext,
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

/** A capture as surfaced to the caller (plan 015 renders these live). */
export type TurnCapture = { id: string; kind: string; summary: string };

export type TakeTurnResult = {
  assistant: string;
  arc: Arc;
  done: boolean;
  /** Captures extracted from THIS user turn. Empty on small talk or failure. */
  captures: TurnCapture[];
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
function arcForNextTurn(history: { role: string; arc: string }[]): Arc {
  const lastAssistant = [...history]
    .reverse()
    .find((m) => m.role === "assistant");
  if (!lastAssistant) return nextArc("INIT", 0);
  const currentArc = lastAssistant.arc as Arc;
  return nextArc(currentArc, userTurnsInArc(history, currentArc));
}

type SessionContext = {
  tenantName: string;
  userName: string;
  department: string | null;
  role: ConversationRole;
  topicTitle: string;
  topicDescription: string | null;
  companyContext: PromptCompanyContext | null;
};

/** Load the static context a prompt needs: the org, the contributor, the topic. */
async function loadContext(
  db: Db,
  sessionId: string,
): Promise<SessionContext | null> {
  const [row] = await db
    .select({
      tenantName: tenants.name,
      userName: users.name,
      department: users.department,
      userRole: users.role,
      topicTitle: topics.title,
      topicDescription: topics.description,
      ctxSummary: companyContext.summary,
      ctxIndustry: companyContext.industry,
      ctxKeySystems: companyContext.keySystems,
      ctxKnownPains: companyContext.knownPains,
      ctxStatus: companyContext.status,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .innerJoin(tenants, eq(sessions.tenantId, tenants.id))
    .leftJoin(topics, eq(sessions.topicId, topics.id))
    .leftJoin(companyContext, eq(sessions.tenantId, companyContext.tenantId))
    .where(eq(sessions.id, sessionId));
  if (!row) return null;
  // Only feed the prompt context that's been activated (not a draft).
  const ctx: PromptCompanyContext | null =
    row.ctxStatus === "active"
      ? {
          summary: row.ctxSummary,
          industry: row.ctxIndustry,
          keySystems: row.ctxKeySystems ?? [],
          knownPains: row.ctxKnownPains ?? [],
        }
      : null;
  return {
    tenantName: row.tenantName,
    userName: row.userName,
    department: row.department,
    role: toConversationRole(row.userRole),
    topicTitle: row.topicTitle ?? "Discovery session",
    topicDescription: row.topicDescription,
    companyContext: ctx,
  };
}

/** Interview arcs already completed before `upcoming`, as a readable list. */
function completedArcs(history: { arc: string }[], upcoming: Arc): string {
  const upcomingIdx = arcIndex(upcoming);
  if (upcomingIdx === null) return "";
  const seen = new Set(history.map((m) => m.arc));
  const done: string[] = [];
  for (const arc of ["ARC_1", "ARC_2", "ARC_3", "ARC_4"] as const) {
    const i = arcIndex(arc);
    if (i !== null && i < upcomingIdx && seen.has(arc)) done.push(arcName(arc));
  }
  return done.join("; ");
}

/**
 * Compact within-session capture summary for the prompt's CAPTURED SO FAR block
 * (docs/03 §3). Most-recent-last, capped to bound prompt size. RLS already
 * scopes captures to the owning contributor. Never returns source quotes.
 */
async function loadCaptureSummary(db: Db, sessionId: string): Promise<string> {
  const rows = await db
    .select({ kind: captures.kind, summary: captures.summary })
    .from(captures)
    .where(
      and(eq(captures.sessionId, sessionId), eq(captures.isRemoved, false)),
    )
    .orderBy(asc(captures.createdAt));
  if (rows.length === 0) return "";
  return rows
    .slice(-12)
    .map((r) => `- ${r.kind}: ${r.summary}`)
    .join("\n");
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
  // The opener has no history and no captures yet; arc/probe blocks are omitted.
  const system = buildSystemPrompt({
    role: ctx.role,
    tenantName: ctx.tenantName,
    userName: ctx.userName,
    department: ctx.department,
    topicTitle: ctx.topicTitle,
    topicDescription: ctx.topicDescription,
    arc,
    companyContext: ctx.companyContext,
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
  // The opener has no user turn to extract from.
  return { assistant, arc, done: isDone(arc), captures: [] };
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
  const interview = arcIndex(arc) !== null;
  const capturesSummary = await loadCaptureSummary(opts.db, opts.sessionId);

  const system = buildSystemPrompt({
    role: ctx.role,
    tenantName: ctx.tenantName,
    userName: ctx.userName,
    department: ctx.department,
    topicTitle: ctx.topicTitle,
    topicDescription: ctx.topicDescription,
    arc,
    arcHistory: completedArcs(history, arc),
    probesRemaining: interview
      ? probesRemaining(userTurnsInArc(history, arc))
      : null,
    capturesSummary,
    companyContext: ctx.companyContext,
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

  const priorAssistant =
    [...history].reverse().find((m) => m.role === "assistant")?.content ?? null;

  const turnCaptures = await extractAndPersist(opts, {
    topicTitle: ctx.topicTitle,
    arc,
    userMessage: opts.userMessage,
    priorAssistant,
  });

  return { assistant, arc, done: isDone(arc), captures: turnCaptures };
}

/**
 * Run the per-turn extraction pass and persist any captures in the SAME
 * transaction as the turn. A failed extraction must NOT fail the turn: on
 * `LlmOutputError` (the model produced unparseable output even after retry) we
 * log a COUNT-ONLY warning and return no captures. Capture content is never
 * logged (CLAUDE.md privacy). Bumps `sessions.captureCount` by the number
 * actually inserted.
 */
async function extractAndPersist(
  opts: Omit<TakeTurnOpts, "userMessage">,
  turn: {
    topicTitle: string;
    arc: Arc;
    userMessage: string;
    priorAssistant: string | null;
  },
): Promise<TurnCapture[]> {
  let items: CapturedItem[];
  try {
    items = await extractFromTurn(turn);
  } catch (err) {
    // Extraction is best-effort: a turn whose reply already succeeded must not
    // fail because extraction produced bad output (LlmOutputError) or isn't
    // configured (LlmNotConfiguredError). Anything else is a real bug — rethrow.
    if (err instanceof LlmOutputError || err instanceof LlmNotConfiguredError) {
      // Count-only: never the message, never the quote. This is the expected
      // best-effort path (bad/absent extraction), so it's a structured warn, not
      // a Sentry capture — the underlying LLM transport failure, if any, was
      // already captured in services/llm/client. A real (non-typed) bug rethrows
      // below and surfaces via tRPC / onRequestError.
      log.warn("conversation.extract.failed", { captured: 0 });
      return [];
    }
    throw err;
  }

  if (items.length === 0) return [];

  const inserted = await opts.db
    .insert(captures)
    .values(
      items.map((c) => ({
        tenantId: opts.tenantId,
        sessionId: opts.sessionId,
        userId: opts.userId,
        kind: c.kind,
        summary: c.summary,
        sourceQuote: c.sourceQuote,
        tags: c.tags,
        // EXT-2: structured quantified impact, when the contributor gave numbers.
        quantifiedFrequencyPerYear:
          c.quantifiedImpact?.frequencyPerYear?.toString() ?? null,
        quantifiedUnitMinutes:
          c.quantifiedImpact?.unitMinutes?.toString() ?? null,
        quantifiedUnitCostUsd:
          c.quantifiedImpact?.unitCostUsd?.toString() ?? null,
        quantifiedBasis: c.quantifiedImpact?.basis ?? null,
      })),
    )
    .returning({
      id: captures.id,
      kind: captures.kind,
      summary: captures.summary,
    });

  await opts.db
    .update(sessions)
    .set({ captureCount: sql`${sessions.captureCount} + ${inserted.length}` })
    .where(
      and(eq(sessions.id, opts.sessionId), eq(sessions.userId, opts.userId)),
    );

  return inserted;
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
