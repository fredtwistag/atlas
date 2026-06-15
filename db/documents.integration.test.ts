import { describe, it, expect, beforeEach } from "vitest";
import { documents } from "./schema";
import {
  asUser,
  seedRow,
  resetDb,
  seedTenants,
  TENANT_A,
  TENANT_B,
} from "./test/helpers";

// CTX-3 — documents tenant isolation + write restriction.

beforeEach(async () => {
  await resetDb();
  await seedTenants();
  await seedRow((tx) =>
    tx.insert(documents).values({
      tenantId: TENANT_A,
      filename: "ops-manual.md",
      mimeType: "text/markdown",
      status: "ingested",
      extractedText: "How we process orders...",
    }),
  );
});

describe("documents — tenant isolation", () => {
  it("tenant A reads its document", async () => {
    const rows = await asUser({ tenantId: TENANT_A }, (tx) =>
      tx.select().from(documents),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].filename).toBe("ops-manual.md");
  });

  it("tenant B reads none", async () => {
    const rows = await asUser({ tenantId: TENANT_B }, (tx) =>
      tx.select().from(documents),
    );
    expect(rows).toHaveLength(0);
  });

  it("a tenant user cannot insert a document (service-role only)", async () => {
    await expect(
      asUser({ tenantId: TENANT_A }, (tx) =>
        tx.insert(documents).values({
          tenantId: TENANT_A,
          filename: "x.txt",
          mimeType: "text/plain",
          status: "uploaded",
        }),
      ),
    ).rejects.toThrow();
  });
});
