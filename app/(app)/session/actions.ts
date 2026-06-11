"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { completeSessionForUser } from "@/lib/sessions";

/** Called from ConversationView when the live conversation reaches "done":
 *  marks the session completed, opens the 7-day edit window, and runs the final
 *  capture-extraction sweep (lib/sessions.ts). */
export async function completeSession(sessionId: string): Promise<void> {
  const session = await getSession();
  if (!session || session.kind !== "tenant") {
    throw new Error("forbidden");
  }
  await completeSessionForUser(
    {
      tenantId: session.tenantId,
      userId: session.userId,
      role: session.role,
    },
    sessionId,
  );
  revalidatePath("/me");
}
