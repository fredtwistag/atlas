"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireTenantSession } from "@/lib/auth-guards";
import { withTenantContext } from "@/db/client";
import { users } from "@/db/schema";
import { setAllowNudges } from "@/lib/nudge-prefs";

/**
 * Record that the current participant acknowledged the privacy notice (PRD
 * F1.5). Writes the user's OWN row under their own claims — RLS-authorized, no
 * service role. Idempotent in effect (re-acking just rewrites the timestamp).
 */
export async function ackPrivacy(): Promise<void> {
  const session = await requireTenantSession();
  await withTenantContext(session, (tx) =>
    tx
      .update(users)
      .set({ privacyAckAt: new Date() })
      .where(eq(users.id, session.userId)),
  );
  revalidatePath("/me");
}

export type NudgePrefResult =
  | { ok: true; allow: boolean }
  | { ok: false; error: string };

/**
 * Toggle the signed-in user's "allow nudges from your manager" preference
 * (plan 025, GDPR Art. 21). Runs under the user's own claims (RLS-authorized —
 * own row only). Returns a result instead of throwing so the toggle can show
 * inline, aria-live confirmation without a full reload.
 */
export async function setNudgePreference(
  allow: boolean,
): Promise<NudgePrefResult> {
  const session = await requireTenantSession();
  try {
    await setAllowNudges(session, allow);
    revalidatePath("/me");
    return { ok: true, allow };
  } catch {
    return {
      ok: false,
      error: "Couldn't save that just now — try again in a moment.",
    };
  }
}
