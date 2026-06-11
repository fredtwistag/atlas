import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { consume } from "@/lib/rate-limit";
import { rateLimits } from "./schema";
import {
  asUser,
  seedRow,
  resetDb,
  seedTenants,
  TENANT_A,
  TENANT_B,
} from "./test/helpers";

/** Read the raw counter via service role (the only path that can see the table). */
async function counter(key: string): Promise<{ count: number } | null> {
  const rows = await seedRow((tx) =>
    tx
      .select({ count: rateLimits.count })
      .from(rateLimits)
      .where(sql`${rateLimits.key} = ${key}`),
  );
  return rows[0] ?? null;
}

/** Force a key's window to have started `seconds` ago (to test rollover). */
async function ageWindow(key: string, seconds: number): Promise<void> {
  await seedRow((tx) =>
    tx.execute(sql`
      UPDATE public.rate_limits
      SET window_starts_at = now() - make_interval(secs => ${seconds})
      WHERE key = ${key}
    `),
  );
}

beforeEach(async () => {
  // resetDb() also clears rate_limits (see db/test/helpers.ts).
  await resetDb();
  await seedTenants();
});

describe("rate_limits — upsert semantics", () => {
  it("first consume inserts a window with count 1 and is allowed", async () => {
    const res = await consume("k1", { limit: 3, windowSeconds: 600 });
    expect(res.allowed).toBe(true);
    expect(res.retryAfterSeconds).toBe(0);
    expect((await counter("k1"))?.count).toBe(1);
  });

  it("increments within the window and blocks past the limit", async () => {
    const opts = { limit: 3, windowSeconds: 600 };
    expect((await consume("k2", opts)).allowed).toBe(true); // 1
    expect((await consume("k2", opts)).allowed).toBe(true); // 2
    expect((await consume("k2", opts)).allowed).toBe(true); // 3
    const blocked = await consume("k2", opts); // 4
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(600);
    expect((await counter("k2"))?.count).toBe(4);
  });

  it("keeps blocking subsequent consumes in the same window", async () => {
    const opts = { limit: 1, windowSeconds: 600 };
    expect((await consume("k3", opts)).allowed).toBe(true);
    expect((await consume("k3", opts)).allowed).toBe(false);
    expect((await consume("k3", opts)).allowed).toBe(false);
  });
});

describe("rate_limits — window rollover", () => {
  it("resets count to 1 once the window has expired", async () => {
    const opts = { limit: 2, windowSeconds: 600 };
    await consume("roll", opts); // count 1
    await consume("roll", opts); // count 2
    expect((await consume("roll", opts)).allowed).toBe(false); // count 3, blocked

    // Age the window past its expiry, then consume again → fresh window.
    await ageWindow("roll", 601);
    const after = await consume("roll", opts);
    expect(after.allowed).toBe(true);
    expect((await counter("roll"))?.count).toBe(1);
  });
});

describe("rate_limits — concurrency", () => {
  it("two parallel consumes at limit-1 allow exactly one", async () => {
    const opts = { limit: 3, windowSeconds: 600 };
    // Bring the window to count 2 (one below the limit), within window.
    await consume("race", opts);
    await consume("race", opts);
    expect((await counter("race"))?.count).toBe(2);

    // Fire the 3rd and 4th in parallel: exactly one should land at count 3
    // (allowed) and the other at count 4 (blocked). The single-statement upsert
    // serializes them on the row lock.
    const [a, b] = await Promise.all([
      consume("race", opts),
      consume("race", opts),
    ]);
    const allowedCount = [a, b].filter((r) => r.allowed).length;
    expect(allowedCount).toBe(1);
    expect((await counter("race"))?.count).toBe(4);
  });
});

describe("rate_limits — not readable via tenant context (adversarial)", () => {
  it("a tenant user cannot read rate_limits (error or zero rows)", async () => {
    await consume("visible-via-service", { limit: 3, windowSeconds: 600 });
    // The row exists and is visible to the service role…
    expect((await counter("visible-via-service"))?.count).toBe(1);

    // …but it is invisible to every tenant context. The table grants SELECT to
    // service_role ONLY (no grant to authenticated) AND has RLS enabled with no
    // policies, so a tenant select fails outright — strictly stronger than the
    // "error or 0 rows" the plan requires.
    await expect(
      asUser({ tenantId: TENANT_A }, (tx) => tx.select().from(rateLimits)),
    ).rejects.toThrow(/permission denied|rate_limits/i);
    await expect(
      asUser({ tenantId: TENANT_B }, (tx) => tx.select().from(rateLimits)),
    ).rejects.toThrow(/permission denied|rate_limits/i);
  });

  it("a tenant user cannot insert into rate_limits", async () => {
    await expect(
      asUser({ tenantId: TENANT_A }, (tx) =>
        tx.insert(rateLimits).values({ key: "evil", count: 99 }),
      ),
    ).rejects.toThrow();
  });
});
