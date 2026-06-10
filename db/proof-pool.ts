import { eq } from "drizzle-orm";
import { withServiceRole, withTenantContext } from "./client";
import { tenants, sprints } from "./schema";

/**
 * Proves the connection-pool config against the real Supabase project: fires a
 * burst of concurrent tenant-context transactions (each a BEGIN…COMMIT, like a
 * page load) and asserts none fail with EMAXCONNSESSION or prepared-statement
 * errors. This validates DATABASE_URL is the TRANSACTION pooler (6543) with
 * prepare:false — the wrong config throws here.
 *
 * Run: npm run db:proof:pool   (tune burst with N=… env)
 */
async function main(): Promise<void> {
  const [t] = await withServiceRole(
    { action: "proof.pool", actor: "proof" },
    (tx) => tx.select().from(tenants).where(eq(tenants.slug, "northwind")),
  );
  if (!t)
    throw new Error("Northwind tenant missing — run `npm run db:seed` first.");

  const claims = {
    tenantId: t.id,
    userId: "00000000-0000-4000-8000-0000000000ff",
    role: "manager",
  };

  const N = Number(process.env.N ?? 40);
  const tasks = Array.from({ length: N }, () =>
    withTenantContext(claims, async (tx) => {
      const rows = await tx.select().from(sprints);
      return rows.length;
    })
      .then(() => ({ ok: true as const }))
      .catch((e: unknown) => ({
        ok: false as const,
        err: e instanceof Error ? e.message : String(e),
      })),
  );

  const results = await Promise.all(tasks);
  const failures = results.filter((r) => !r.ok);
  // eslint-disable-next-line no-console
  console.log(
    `pool proof: ${N - failures.length}/${N} concurrent tenant-context reads ok`,
  );
  if (failures.length) {
    console.error("failures (first 3):", failures.slice(0, 3));
    throw new Error("connection-pool proof FAILED");
  }
  // eslint-disable-next-line no-console
  console.log("PASS — no connection exhaustion under concurrency");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
