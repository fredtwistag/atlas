import { log } from "@/lib/log";
import { captureFailure } from "@/lib/observability";
import { runFinalExtractionForSession } from "@/lib/sessions";
import { inngest } from "../client";

/**
 * On `session/completed` (plan 020, Step 4): run the whole-transcript final
 * extraction sweep (014's `extractFromSession`, via lib/sessions), then request
 * a DEBOUNCED opportunity recompute for the sprint. The recompute is a separate
 * `opportunity/recompute-requested` event whose handler debounces ~10min per
 * sprint, so a burst of completions in the same sprint recomputes once.
 *
 * Extraction is its own step so a recompute hiccup never re-runs the LLM sweep.
 * Privacy (CLAUDE.md / plan 023): IDs and counts only — never transcript text or
 * capture content.
 */
export const sessionCompleted = inngest.createFunction(
  { id: "session-completed", name: "Process a completed session" },
  { event: "session/completed" },
  async ({ event, step }) => {
    const { sessionId, tenantId } = event.data;

    const result = await step.run("final-extraction", async () => {
      try {
        return await runFinalExtractionForSession(sessionId, tenantId);
      } catch (err) {
        captureFailure(err, {
          area: "jobs",
          tenantId,
          sessionId,
          tags: { job: "session-completed" },
        });
        log.error("session.completed.extract.failed", {
          area: "jobs",
          tenantId,
        });
        throw err;
      }
    });

    if (!result) {
      // Session vanished between emit and run; nothing to recompute.
      log.warn("session.completed.skipped", {
        reason: "session_missing",
        tenantId,
      });
      return { extracted: false };
    }

    // Hand off to the debounced recompute handler (coalesces per sprint).
    await step.sendEvent("request-recompute", {
      name: "opportunity/recompute-requested",
      data: { sprintId: result.sprintId, tenantId },
    });

    log.info("session.completed.processed", { tenantId });
    return { extracted: true };
  },
);
