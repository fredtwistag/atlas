import { sql } from "drizzle-orm";
import { withServiceRole, type Db } from "@/db/client";
import { auditLog } from "@/db/schema";
import { log } from "@/lib/log";
import { captureFailure } from "@/lib/observability";
import { inngest } from "../client";

const DAY_MS = 86_400_000;

/** Grace period after expiry before a pending invite is hard-deleted. */
export const CLEANUP_GRACE_DAYS = 30;

/**
 * Delete PENDING invitations whose expiry lapsed more than 30 days ago, and
 * audit the count (plan 025, Step 4).
 *
 * Only `status = 'pending'` rows are touched: accepted invitations are kept
 * forever for provenance (who joined a tenant, when, invited by whom).
 * Cancelled rows are also left alone — they're an explicit record. Cross-tenant
 * cron, so it runs under the sanctioned service-role context (CLAUDE.md) and the
 * delete is content-free (no email/name logged, count only).
 *
 * Returns the number deleted so the cron handler and tests can assert without
 * reading logs.
 */
export async function runInviteCleanup(now = Date.now()): Promise<number> {
  const cutoff = new Date(now - CLEANUP_GRACE_DAYS * DAY_MS);
  // The wrapper's own audit row records the sweep ran ("invite.cleanup.scan");
  // the explicit row below carries the deleted COUNT (known only post-delete),
  // under the distinct "invite.cleanup" action the runbook/tests assert on.
  return withServiceRole(
    { action: "invite.cleanup.scan", actor: "system" },
    async (tx: Db) => {
      const deleted = await tx.execute(sql`
        DELETE FROM public.invitations
        WHERE status = 'pending'
          AND expires_at IS NOT NULL
          AND expires_at < ${cutoff.toISOString()}
        RETURNING id
      `);
      const count = deleted.length;

      // Audit the sweep (count only — never an email or name).
      await tx.insert(auditLog).values({
        action: "invite.cleanup",
        targetId: "system",
        metadata: { deleted: count, graceDays: CLEANUP_GRACE_DAYS },
      });

      log.info("invite.cleanup.complete", { deleted: count });
      return count;
    },
  );
}

/**
 * Daily cron that prunes long-expired pending invitations (plan 025, Step 4).
 * Runs after the morning reminder cron. Keeps accepted/cancelled rows forever.
 */
export const inviteCleanup = inngest.createFunction(
  { id: "invite-cleanup", name: "Prune long-expired pending invitations" },
  { cron: "30 9 * * *" },
  async ({ step }) => {
    return step.run("delete-expired-pending-invitations", async () => {
      try {
        const deleted = await runInviteCleanup();
        return { deleted };
      } catch (err) {
        captureFailure(err, {
          area: "jobs",
          tags: { job: "invite-cleanup" },
        });
        log.error("invite.cleanup.failed", { area: "jobs" });
        throw err;
      }
    });
  },
);
