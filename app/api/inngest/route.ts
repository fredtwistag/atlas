import { serve } from "inngest/next";
import { inngest } from "@/services/jobs/client";
import { nudgeSend } from "@/services/jobs/functions/nudge-send";
import { inviteSend } from "@/services/jobs/functions/invite-send";
import { sessionCompleted } from "@/services/jobs/functions/session-completed";
import {
  recomputeOnRequest,
  recomputeNightly,
} from "@/services/jobs/functions/recompute";
import { reminderIcIdle } from "@/services/jobs/functions/reminders";
import { inviteCleanup } from "@/services/jobs/functions/invite-cleanup";
import {
  digestWeeklySponsor,
  digestWeeklyManager,
} from "@/services/jobs/functions/digests";

/**
 * Inngest serve endpoint (plan 020, Step 1). Registers every Atlas background
 * function with the Inngest runtime; GET/POST/PUT are how Inngest introspects,
 * invokes, and registers. In local dev, `npx inngest-cli dev` discovers these by
 * hitting this route. In prod, the Inngest Cloud app points at
 * `${APP_URL}/api/inngest` with INNGEST_SIGNING_KEY set (see docs/runbooks/deploy.md §5).
 *
 * The serve handler reads INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY from the env;
 * both are optional (lib/env.ts) so a missing key never breaks boot or build —
 * unconfigured, the functions simply don't run in prod.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    nudgeSend,
    inviteSend,
    sessionCompleted,
    recomputeOnRequest,
    recomputeNightly,
    reminderIcIdle,
    inviteCleanup,
    digestWeeklySponsor,
    digestWeeklyManager,
  ],
});
