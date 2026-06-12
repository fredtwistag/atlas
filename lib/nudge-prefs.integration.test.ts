import { describe, it, expect, beforeEach } from "vitest";
import { getAllowNudges, setAllowNudges } from "./nudge-prefs";
import { users } from "@/db/schema";
import {
  seedRow,
  resetDb,
  seedTenants,
  TENANT_A,
  TENANT_B,
  USER_A,
  USER_B,
} from "@/db/test/helpers";

beforeEach(async () => {
  await resetDb();
  await seedTenants();
  await seedRow((tx) =>
    tx.insert(users).values([
      {
        id: USER_A,
        tenantId: TENANT_A,
        email: "a@a.example",
        name: "IC A",
        role: "ic",
      },
      {
        id: USER_B,
        tenantId: TENANT_B,
        email: "b@b.example",
        name: "IC B",
        role: "ic",
      },
    ]),
  );
});

const actorA = { tenantId: TENANT_A, userId: USER_A, role: "ic" };

describe("nudge-prefs (plan 025)", () => {
  it("defaults to allow_nudges = true", async () => {
    expect(await getAllowNudges(actorA)).toBe(true);
  });

  it("round-trips a false then true through the user's own row", async () => {
    await setAllowNudges(actorA, false);
    expect(await getAllowNudges(actorA)).toBe(false);

    await setAllowNudges(actorA, true);
    expect(await getAllowNudges(actorA)).toBe(true);
  });

  it("a user cannot flip another tenant's row (RLS scopes the UPDATE)", async () => {
    // actorA tries (in effect) to change USER_B — but the update is RLS-scoped
    // to tenant A, so USER_B (tenant B) is untouched.
    await setAllowNudges({ ...actorA, userId: USER_B }, false);
    const actorB = { tenantId: TENANT_B, userId: USER_B, role: "ic" };
    expect(await getAllowNudges(actorB)).toBe(true);
  });
});
