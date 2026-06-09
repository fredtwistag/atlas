import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { users, twistagUsers } from "./schema";
import { withAuthAdmin } from "./client";
import { seedRow, resetDb, seedTenants, TENANT_A } from "./test/helpers";

async function runHook(email: string): Promise<Record<string, unknown>> {
  const event = {
    claims: { email, sub: "00000000-0000-0000-0000-000000000999" },
  };
  const rows = await withAuthAdmin((tx) =>
    tx.execute(
      sql`SELECT public.custom_access_token_hook(${JSON.stringify(event)}::jsonb) AS out`,
    ),
  );
  return (rows[0].out as { claims: Record<string, unknown> }).claims;
}

beforeEach(async () => {
  await resetDb();
  await seedTenants();
  await seedRow((tx) =>
    tx.execute(sql`TRUNCATE public.twistag_users RESTART IDENTITY CASCADE`),
  );
});

describe("custom_access_token_hook", () => {
  it("injects twistag_role for a Twistag staff email", async () => {
    await seedRow((tx) =>
      tx.insert(twistagUsers).values({
        email: "admin@twistag.com",
        name: "Super Admin",
        role: "twistag_admin",
      }),
    );
    const claims = await runHook("admin@twistag.com");
    expect(claims.twistag_role).toBe("twistag_admin");
    expect(claims.tenant_id).toBeUndefined();
  });

  it("injects tenant_id/role/user_id for a tenant app user", async () => {
    await seedRow((tx) =>
      tx.insert(users).values({
        tenantId: TENANT_A,
        email: "mgr@a.example",
        name: "Manager A",
        role: "manager",
      }),
    );
    const claims = await runHook("mgr@a.example");
    expect(claims.tenant_id).toBe(TENANT_A);
    expect(claims.role).toBe("manager");
    expect(typeof claims.user_id).toBe("string");
  });

  it("passes through unknown emails unchanged", async () => {
    const claims = await runHook("nobody@nowhere.example");
    expect(claims.twistag_role).toBeUndefined();
    expect(claims.tenant_id).toBeUndefined();
    expect(claims.email).toBe("nobody@nowhere.example");
  });
});
