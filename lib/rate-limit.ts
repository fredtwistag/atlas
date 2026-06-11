import { sql } from "drizzle-orm";
import { withServiceRole } from "@/db/client";

/**
 * Postgres-backed fixed-window rate limiter for the auth and email surfaces.
 * Server-only (no Next imports, so it stays unit/integration testable — the
 * `lib/members.ts` convention).
 *
 * Why Postgres and not Redis/KV: at pilot scale (1-3 tenants) adding a vendor for
 * launch week is unjustified, and the limits here are coarse (per-minute, per-day).
 * The `consume()` interface is the seam — at >50 tenants, move hot keys to Vercel
 * KV/Upstash behind this same signature (see plan 019 maintenance notes).
 *
 * The state lives in `rate_limits` (migration 0007), an infrastructure table with
 * NO tenant_id and NO client-readable RLS. All access goes through `withServiceRole`
 * with `skipAudit: true` and action "rate.limit" — auditing every check would flood
 * audit_log, and a rate-limit counter is not a security event worth a row per hit.
 */

export type ConsumeOptions = {
  /** Max allowed consumes within the window before requests are blocked. */
  limit: number;
  /** Length of the fixed window, in seconds. */
  windowSeconds: number;
};

export type ConsumeResult = {
  /** True if this consume is within the limit; false if the caller is blocked. */
  allowed: boolean;
  /**
   * Seconds the caller should wait before the current window resets. 0 when
   * allowed; otherwise the time remaining until `window_starts_at + windowSeconds`.
   */
  retryAfterSeconds: number;
};

/**
 * Record one attempt against `key` and report whether it is within `limit` for the
 * current `windowSeconds` window.
 *
 * Implementation is a SINGLE atomic upsert (`INSERT ... ON CONFLICT (key) DO UPDATE`):
 * - First hit for a key: insert a fresh window (count = 1).
 * - Subsequent hit, window still open: increment count, keep window_starts_at.
 * - Subsequent hit, window expired: roll the window over (window_starts_at = now,
 *   count = 1).
 * Because it is one statement, concurrent consumes serialize on the row lock, so two
 * parallel calls at limit-1 can never both read the pre-increment count — exactly one
 * crosses the threshold. The RETURNING row gives the post-write count + window start,
 * from which `allowed` and `retryAfterSeconds` are derived.
 */
export async function consume(
  key: string,
  opts: ConsumeOptions,
): Promise<ConsumeResult> {
  const { limit, windowSeconds } = opts;

  const rows = await withServiceRole(
    { action: "rate.limit", actor: "rate-limit", skipAudit: true },
    async (tx) => {
      const result = await tx.execute(sql`
        INSERT INTO public.rate_limits (key, window_starts_at, count)
        VALUES (${key}, now(), 1)
        ON CONFLICT (key) DO UPDATE SET
          window_starts_at = CASE
            WHEN public.rate_limits.window_starts_at
                 > now() - make_interval(secs => ${windowSeconds})
            THEN public.rate_limits.window_starts_at
            ELSE now()
          END,
          count = CASE
            WHEN public.rate_limits.window_starts_at
                 > now() - make_interval(secs => ${windowSeconds})
            THEN public.rate_limits.count + 1
            ELSE 1
          END
        RETURNING
          count AS count,
          EXTRACT(EPOCH FROM (
            window_starts_at + make_interval(secs => ${windowSeconds}) - now()
          )) AS seconds_left
      `);
      return result as unknown as Array<{
        count: number | string;
        seconds_left: number | string;
      }>;
    },
  );

  const row = rows[0];
  const count = Number(row?.count ?? 0);
  const secondsLeft = Math.max(0, Math.ceil(Number(row?.seconds_left ?? 0)));
  const allowed = count <= limit;

  return {
    allowed,
    retryAfterSeconds: allowed ? 0 : secondsLeft,
  };
}
