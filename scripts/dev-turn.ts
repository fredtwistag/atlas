/**
 * Plan 013, Step 7 — live smoke against the real Anthropic API.
 *
 * Seeds a throwaway tenant/user/sprint/topic/session, runs the conversation
 * engine end-to-end (openSession + two takeTurn calls with DIFFERENT inputs)
 * against the dev DB and the real model, then deletes the throwaway rows.
 *
 * Privacy: prints LATENCY and structural checks only — never message content.
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json --env-file=.env.local scripts/dev-turn.ts
 */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { withServiceRole, withTenantContext } from "@/db/client";
import {
  tenants,
  users,
  sprints,
  topics,
  sessions,
} from "@/db/schema";
import { openSession, takeTurn } from "@/services/conversation/engine";

const TOPIC_TITLE = "Quote-to-cash handoffs";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set — load it from .env.local");
  }

  const tenantId = randomUUID();
  const userId = randomUUID();
  const sprintId = randomUUID();
  const topicId = randomUUID();
  const sessionId = randomUUID();

  await withServiceRole(
    { action: "dev.smoke.seed", actor: "dev-turn" },
    async (tx) => {
      await tx.insert(tenants).values({
        id: tenantId,
        slug: `smoke-${tenantId.slice(0, 8)}`,
        name: "Smoke Co",
        segment: "test",
        status: "active",
      });
      await tx.insert(users).values({
        id: userId,
        tenantId,
        email: `smoke-${userId.slice(0, 8)}@example.com`,
        name: "Sam Rivera",
        role: "ic",
        department: "Finance",
      });
      await tx.insert(sprints).values({
        id: sprintId,
        tenantId,
        name: "Smoke Sprint",
        primaryFocus: "quote-to-cash",
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        cadence: "weekly",
        status: "active",
      });
      await tx.insert(topics).values({
        id: topicId,
        tenantId,
        sprintId,
        title: TOPIC_TITLE,
        description: "How a quote becomes cash, end to end.",
        orderIdx: 1,
        questionCount: 5,
        estMinutes: 6,
      });
      await tx.insert(sessions).values({
        id: sessionId,
        tenantId,
        sprintId,
        topicId,
        userId,
        status: "in_progress",
      });
    },
  );

  const ctx = { tenantId, userId, role: "ic" };
  const timings: Record<string, number> = {};

  const opener = await withTenantContext(ctx, async (tx) => {
    const t0 = Date.now();
    const r = await openSession({ db: tx, tenantId, sessionId, userId });
    timings.open = Date.now() - t0;
    return r;
  });

  const replyA = await withTenantContext(ctx, async (tx) => {
    const t0 = Date.now();
    const r = await takeTurn({
      db: tx,
      tenantId,
      sessionId,
      userId,
      userMessage:
        "It starts when a sales rep drops a signed order form into our shared drive.",
    });
    timings.turnA = Date.now() - t0;
    return r;
  });

  const replyB = await withTenantContext(ctx, async (tx) => {
    const t0 = Date.now();
    const r = await takeTurn({
      db: tx,
      tenantId,
      sessionId,
      userId,
      userMessage:
        "Honestly the worst part is chasing finance for credit approvals — it stalls everything for days.",
    });
    timings.turnB = Date.now() - t0;
    return r;
  });

  // Structural checks only — NO content printed.
  const differ = replyA.assistant.trim() !== replyB.assistant.trim();
  const openerRefsTopic = opener.assistant
    .toLowerCase()
    .includes(TOPIC_TITLE.toLowerCase().split(" ")[0]); // "quote"

  // Cleanup.
  await withServiceRole(
    { action: "dev.smoke.cleanup", actor: "dev-turn" },
    async (tx) => {
      await tx.execute(
        sql`DELETE FROM public.session_messages WHERE tenant_id = ${tenantId}::uuid`,
      );
      await tx.execute(
        sql`DELETE FROM public.sessions WHERE tenant_id = ${tenantId}::uuid`,
      );
      await tx.execute(
        sql`DELETE FROM public.topics WHERE tenant_id = ${tenantId}::uuid`,
      );
      await tx.execute(
        sql`DELETE FROM public.sprints WHERE tenant_id = ${tenantId}::uuid`,
      );
      await tx.execute(
        sql`DELETE FROM public.users WHERE tenant_id = ${tenantId}::uuid`,
      );
      await tx.execute(
        sql`DELETE FROM public.tenants WHERE id = ${tenantId}::uuid`,
      );
    },
  );

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        latencyMs: timings,
        openerArc: opener.arc,
        replyA: { arc: replyA.arc, done: replyA.done, chars: replyA.assistant.length },
        replyB: { arc: replyB.arc, done: replyB.done, chars: replyB.assistant.length },
        repliesDiffer: differ,
        openerReferencesTopic: openerRefsTopic,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
