"use server";

import { getApi } from "@/server/trpc/caller";

export type NudgeResult = { ok: true } | { ok: false; error: string };

/**
 * Log a nudge to a participant. Returns a result instead of throwing so the
 * composer can show the 48-hour cooldown message inline. Guarded server-side by
 * sprint.nudge (managerProcedure + tenant scoping).
 */
export async function sendNudgeAction(
  sprintId: string,
  userId: string,
  input: { channel: "email" | "slack"; subject?: string; body: string },
): Promise<NudgeResult> {
  const api = await getApi();
  try {
    await api.sprint.nudge({ sprintId, userId, ...input });
    return { ok: true };
  } catch (e) {
    const error =
      e instanceof Error ? e.message : "Couldn't log the nudge — try again.";
    return { ok: false, error };
  }
}
