import { and, eq } from "drizzle-orm";
import { withServiceRole } from "@/db/client";
import { sprints } from "@/db/schema";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { captureFailure } from "@/lib/observability";
import { recompute } from "@/services/opportunity/recompute";
import { inngest } from "../client";

/**
 * Recompute the opportunity backlog for one sprint (plan 020, Steps 4 + 6).
 *
 * The recompute is LLM-backed (cluster + score). With no ANTHROPIC_API_KEY it
 * would throw `LlmNotConfiguredError`, so we SKIP SILENTLY when the key is unset
 * — a content-free count log only, no error. This keeps dev + key-less CI green
 * and matches Step 6's "skip silently (log count only) when LLM key unset".
 *
 * Returns a small flag object so callers/tests can assert the skip path without
 * inspecting logs. `actor: "system"` is recorded in recompute's audit row.
 */
export async function runRecompute(
  sprintId: string,
  tenantId: string,
): Promise<{ ran: boolean; reason?: "no_llm_key" }> {
  if (!env.anthropicApiKey()) {
    log.info("recompute.skipped", { reason: "no_llm_key", tenantId });
    return { ran: false, reason: "no_llm_key" };
  }
  await recompute(sprintId, "system");
  return { ran: true };
}

/**
 * Debounced per-sprint recompute. Triggered by `opportunity/recompute-requested`
 * (the session-completion worker). The function-level debounce coalesces a burst
 * of session completions for the SAME sprint into a single recompute ~10 minutes
 * after the last one, instead of recomputing on every completion.
 */
export const recomputeOnRequest = inngest.createFunction(
  {
    id: "opportunity-recompute",
    name: "Recompute opportunities for a sprint",
    debounce: { key: "event.data.sprintId", period: "10m" },
  },
  { event: "opportunity/recompute-requested" },
  async ({ event, step }) => {
    return step.run("recompute", async () => {
      try {
        return await runRecompute(event.data.sprintId, event.data.tenantId);
      } catch (err) {
        captureFailure(err, {
          area: "jobs",
          tenantId: event.data.tenantId,
          tags: { job: "opportunity-recompute" },
        });
        log.error("recompute.failed", {
          area: "jobs",
          tenantId: event.data.tenantId,
        });
        throw err;
      }
    });
  },
);

/**
 * Nightly recompute cron (plan 020, Step 6): recompute every ACTIVE sprint. Runs
 * once a night so opportunity scores track the latest captures even without new
 * completions. Skips silently per-sprint when the LLM key is unset (count log).
 */
export const recomputeNightly = inngest.createFunction(
  {
    id: "opportunity-recompute-nightly",
    name: "Nightly opportunity recompute",
  },
  { cron: "0 2 * * *" },
  async ({ step }) => {
    const active = await step.run("load-active-sprints", () =>
      loadActiveSprints(),
    );

    if (!env.anthropicApiKey()) {
      // One content-free count line covers the whole run (Step 6).
      log.info("recompute.nightly.skipped", {
        reason: "no_llm_key",
        count: active.length,
      });
      return { recomputed: 0, skipped: active.length };
    }

    let recomputed = 0;
    for (const s of active) {
      await step.run(`recompute:${s.id}`, async () => {
        try {
          await recompute(s.id, "system");
          return { ok: true };
        } catch (err) {
          captureFailure(err, {
            area: "jobs",
            tenantId: s.tenantId,
            tags: { job: "opportunity-recompute-nightly" },
          });
          log.error("recompute.nightly.sprint.failed", {
            area: "jobs",
            tenantId: s.tenantId,
          });
          throw err;
        }
      });
      recomputed += 1;
    }

    log.info("recompute.nightly.complete", { count: recomputed });
    return { recomputed };
  },
);

/** All active sprints across tenants (service role — cross-tenant cron read). */
export async function loadActiveSprints(): Promise<
  { id: string; tenantId: string }[]
> {
  return withServiceRole(
    { action: "recompute.scan", actor: "system" },
    async (tx) =>
      tx
        .select({ id: sprints.id, tenantId: sprints.tenantId })
        .from(sprints)
        .where(eq(sprints.status, "active")),
  );
}
