"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireTenantSession } from "@/lib/auth-guards";
import { withTenantContext } from "@/db/client";
import { users } from "@/db/schema";

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
