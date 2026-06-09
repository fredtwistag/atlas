import { describe, it, expect, beforeEach } from "vitest";
import { users, captures } from "./schema";
import {
  asUser,
  seedRow,
  resetDb,
  seedTenants,
  TENANT_A,
  TENANT_B,
} from "./test/helpers";

const USER_ID = "22222222-2222-2222-2222-2222222222b1";

beforeEach(async () => {
  await resetDb();
  await seedTenants();
  await seedRow((tx) =>
    tx.insert(users).values({
      id: USER_ID,
      tenantId: TENANT_A,
      email: "ic@a.example",
      name: "IC A",
      role: "ic",
    }),
  );
  await seedRow((tx) =>
    tx.insert(captures).values({
      tenantId: TENANT_A,
      userId: USER_ID,
      kind: "bottleneck",
      summary: "A secret capture about the workflow.",
      sourceQuote: "the quote",
    }),
  );
});

describe("captures — tenant isolation", () => {
  it("tenant A reads its capture", async () => {
    const rows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(captures),
    );
    expect(rows).toHaveLength(1);
  });

  it("tenant B reads none", async () => {
    const rows = await asUser({ tenantId: TENANT_B }, (tx) =>
      tx.select().from(captures),
    );
    expect(rows).toHaveLength(0);
  });

  it("tenant B cannot insert tagged tenant A", async () => {
    await expect(
      asUser({ tenantId: TENANT_B }, (tx) =>
        tx.insert(captures).values({
          tenantId: TENANT_A,
          userId: USER_ID,
          kind: "bottleneck",
          summary: "evil capture content here",
          sourceQuote: "q",
        }),
      ),
    ).rejects.toThrow();
  });
});
