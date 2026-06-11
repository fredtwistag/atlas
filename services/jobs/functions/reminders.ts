import { createElement } from "react";
import { and, eq, gt, ne } from "drizzle-orm";
import { withServiceRole, type Db } from "@/db/client";
import {
  sprints,
  sessions,
  sprintParticipants,
  users,
  tenants,
  auditLog,
} from "@/db/schema";
import { appUrl } from "@/lib/app-url";
import { log } from "@/lib/log";
import { captureFailure } from "@/lib/observability";
import { sendEmail } from "@/services/email/send";
import { NudgeEmail } from "@/emails/NudgeEmail";
import { inngest } from "../client";

const HOUR = 3_600_000;
const IDLE_HOURS = 72;

type IdleIc = {
  userId: string;
  tenantId: string;
  email: string;
  orgName: string;
};

/**
 * ICs who are idle and due a system reminder (plan 020, Step 5):
 *  - in an ACTIVE sprint,
 *  - with at least one session NOT yet completed (so there's something to do),
 *  - no completed session in the last 72h,
 *  - no system reminder ("reminder.ic.idle") in the last 72h (no double-nudging).
 *
 * Plan 025's opt-out flag doesn't exist yet, so this stays conservative: a
 * gentle, manager-less, system reminder, only to ICs with remaining work. Read
 * under service role (cross-tenant cron, audited).
 */
export async function loadIdleIcs(now = Date.now()): Promise<IdleIc[]> {
  const cutoff = new Date(now - IDLE_HOURS * HOUR);
  return withServiceRole(
    { action: "reminder.scan", actor: "system" },
    async (tx) => {
      // ICs in active sprints with >=1 incomplete session.
      const rows = await tx
        .selectDistinct({
          userId: users.id,
          tenantId: users.tenantId,
          email: users.email,
          orgName: tenants.name,
        })
        .from(sessions)
        .innerJoin(sprints, eq(sessions.sprintId, sprints.id))
        .innerJoin(users, eq(sessions.userId, users.id))
        .innerJoin(tenants, eq(users.tenantId, tenants.id))
        .innerJoin(
          sprintParticipants,
          and(
            eq(sprintParticipants.sprintId, sessions.sprintId),
            eq(sprintParticipants.userId, sessions.userId),
          ),
        )
        .where(
          and(
            eq(sprints.status, "active"),
            eq(users.role, "ic"),
            ne(sessions.status, "completed"),
          ),
        );

      const due: IdleIc[] = [];
      for (const r of rows) {
        // Completed a session recently? Not idle.
        const recentDone = await tx
          .select({ id: sessions.id })
          .from(sessions)
          .where(
            and(
              eq(sessions.userId, r.userId),
              eq(sessions.status, "completed"),
              gt(sessions.completedAt, cutoff),
            ),
          )
          .limit(1);
        if (recentDone.length > 0) continue;

        // Reminded in the last 72h? Skip (no double-nudge).
        const recentReminder = await tx
          .select({ id: auditLog.id })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.action, "reminder.ic.idle"),
              eq(auditLog.tenantId, r.tenantId),
              eq(auditLog.userId, r.userId),
              gt(auditLog.at, cutoff),
            ),
          )
          .limit(1);
        if (recentReminder.length > 0) continue;

        due.push({
          userId: r.userId,
          tenantId: r.tenantId,
          email: r.email,
          orgName: r.orgName,
        });
      }
      return due;
    },
  );
}

const REMINDER_BODY =
  "Just a gentle reminder that your Atlas discovery sessions are open whenever " +
  "you have a spare few minutes. There's no deadline pressure — your take on how " +
  "the work actually runs is what makes the sprint worth doing.";

/**
 * Audit the reminder and send it, atomically. `withServiceRole` writes the
 * `reminder.ic.idle` audit row — the very row the 72h guard in `loadIdleIcs`
 * checks — and then runs the send in the SAME transaction. A delivery failure
 * therefore rolls the audit row back, so the IC isn't silently skipped next run.
 * Mirrors the nudge worker's cooldown atomicity (the audit row IS the guard).
 */
export async function sendIdleReminder(ic: IdleIc): Promise<void> {
  await withServiceRole(
    {
      action: "reminder.ic.idle",
      actor: "system",
      tenantId: ic.tenantId,
      userId: ic.userId,
      metadata: { channel: "email" },
    },
    async (_tx: Db) => {
      await sendEmail({
        to: ic.email,
        subject: "Your Atlas sessions are still open",
        react: createElement(NudgeEmail, {
          senderName: "Atlas",
          orgName: ic.orgName,
          body: REMINDER_BODY,
          ctaUrl: `${appUrl()}/me`,
        }),
      });
    },
  );
}

/**
 * Daily idle-IC reminder cron (plan 020, Step 5). Finds idle ICs and sends each
 * a gentle system reminder, one per step (independent retry + visibility).
 */
export const reminderIcIdle = inngest.createFunction(
  { id: "reminder-ic-idle", name: "Remind idle ICs" },
  { cron: "0 9 * * *" },
  async ({ step }) => {
    const idle = await step.run("load-idle-ics", () => loadIdleIcs());

    let sent = 0;
    for (const ic of idle) {
      await step.run(`remind:${ic.userId}`, async () => {
        try {
          await sendIdleReminder(ic);
          return { sent: true };
        } catch (err) {
          captureFailure(err, {
            area: "jobs",
            tenantId: ic.tenantId,
            tags: { job: "reminder-ic-idle" },
          });
          log.error("reminder.ic.idle.failed", {
            area: "jobs",
            tenantId: ic.tenantId,
          });
          throw err;
        }
      });
      sent += 1;
    }

    log.info("reminder.ic.idle.complete", { count: sent });
    return { reminded: sent };
  },
);
