import { createElement } from "react";
import { and, eq, gt } from "drizzle-orm";
import { withServiceRole, type Db } from "@/db/client";
import { sprints, users, tenants, auditLog } from "@/db/schema";
import { appUrl } from "@/lib/app-url";
import { log } from "@/lib/log";
import { captureFailure } from "@/lib/observability";
import { sendEmail } from "@/services/email/send";
import { NudgeEmail } from "@/emails/NudgeEmail";
import { inngest, type AtlasEvents } from "../client";

const DAY = 86_400_000;

export type NudgeJobInput = AtlasEvents["nudge/requested"]["data"];

/**
 * The nudge send, lifted verbatim (in behavior) out of the tRPC `sprint.nudge`
 * mutation (plan 020, Step 2). This is the SANCTIONED service-role + audit site
 * per CLAUDE.md — the tRPC layer no longer sends email under service role.
 *
 * The whole body runs in ONE `withServiceRole` transaction so the cooldown check
 * and the audit write stay atomic: two concurrent nudges to the same recipient
 * serialize on the audit read/write and exactly one gets through. The email is
 * sent INSIDE the transaction so a real delivery failure (sendEmail throws when
 * RESEND_API_KEY is set) rolls the audit row back and the 48h cooldown isn't
 * burned without a message going out — the original guarantee, preserved.
 *
 * Privacy (CLAUDE.md / plan 023): nothing here logs the recipient, the subject,
 * or the body. Only IDs/flags.
 */
export async function runNudgeSend(input: NudgeJobInput): Promise<{
  ok: boolean;
  reason?: "target_missing" | "sprint_missing" | "cooldown";
}> {
  return withServiceRole(
    { action: "nudge.send", actor: input.actorId, tenantId: input.tenantId },
    async (tx) => sendNudge(tx, input),
  );
}

async function sendNudge(
  tx: Db,
  input: NudgeJobInput,
): Promise<{
  ok: boolean;
  reason?: "target_missing" | "sprint_missing" | "cooldown";
}> {
  const { tenantId } = input;

  const [target] = await tx
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(and(eq(users.id, input.userId), eq(users.tenantId, tenantId)));
  if (!target) {
    // The recipient vanished between enqueue and run. Content-free.
    log.warn("nudge.send.skipped", { reason: "target_missing", tenantId });
    return { ok: false, reason: "target_missing" };
  }

  const [spr] = await tx
    .select({ id: sprints.id })
    .from(sprints)
    .where(and(eq(sprints.id, input.sprintId), eq(sprints.tenantId, tenantId)));
  if (!spr) {
    log.warn("nudge.send.skipped", { reason: "sprint_missing", tenantId });
    return { ok: false, reason: "sprint_missing" };
  }

  // 48h per-recipient cooldown. Read + write live in this one transaction so
  // the check and the audit row that satisfies it can't interleave.
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
    log.info("nudge.send.skipped", { reason: "cooldown", tenantId });
    return { ok: false, reason: "cooldown" };
  }

  await tx.insert(auditLog).values({
    tenantId,
    userId: input.userId,
    action: "nudge.sent",
    targetId: input.sprintId,
    metadata: { channel: input.channel, actor: input.actorId },
  });

  // Email channel only (Slack is v1.5). A throw here rolls the tx back so the
  // audit row above is undone and the cooldown is not burned.
  if (input.channel === "email") {
    const [sender] = await tx
      .select({ name: users.name })
      .from(users)
      .where(and(eq(users.id, input.actorId), eq(users.tenantId, tenantId)));
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

  return { ok: true };
}

/**
 * Inngest function wrapper. Thin: it runs the body and lets a thrown email error
 * propagate so Inngest retries the step (and the rolled-back audit row means a
 * retry re-checks the cooldown cleanly). Captured to Sentry on the way out.
 */
export const nudgeSend = inngest.createFunction(
  { id: "nudge-send", name: "Send a participant nudge" },
  { event: "nudge/requested" },
  async ({ event, step }) => {
    return step.run("send-nudge", async () => {
      try {
        return await runNudgeSend(event.data);
      } catch (err) {
        captureFailure(err, {
          area: "jobs",
          tenantId: event.data.tenantId,
          tags: { job: "nudge-send" },
        });
        log.error("nudge.send.failed", {
          area: "jobs",
          tenantId: event.data.tenantId,
        });
        throw err;
      }
    });
  },
);
