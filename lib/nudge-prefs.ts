/**
 * Nudge preference core logic (plan 025), server-only and free of Next/Supabase
 * imports so it's integration-testable. The "use server" wrapper in
 * app/(app)/me/actions.ts adds session resolution + revalidation on top.
 *
 * Runs under the IC's OWN claims (RLS-authorized) — a user can only ever read or
 * change their own row. GDPR Art. 21 objection right: when false, manager nudges
 * (nudge-send worker + sprint.nudge) and system idle reminders all skip them.
 */
import { eq } from "drizzle-orm";
import { withTenantContext } from "@/db/client";
import { users } from "@/db/schema";

type Actor = { tenantId: string; userId: string; role: string };

/** Read the current user's nudge preference. Defaults to true if the row is gone. */
export async function getAllowNudges(actor: Actor): Promise<boolean> {
  return withTenantContext(actor, async (tx) => {
    const [row] = await tx
      .select({ allowNudges: users.allowNudges })
      .from(users)
      .where(eq(users.id, actor.userId));
    return row?.allowNudges ?? true;
  });
}

/** Set the current user's nudge preference. Tenant-scoped via RLS (own row only). */
export async function setAllowNudges(
  actor: Actor,
  allow: boolean,
): Promise<void> {
  await withTenantContext(actor, async (tx) => {
    await tx
      .update(users)
      .set({ allowNudges: allow })
      .where(eq(users.id, actor.userId));
  });
}
