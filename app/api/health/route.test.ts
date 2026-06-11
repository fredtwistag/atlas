import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const pingDb = vi.fn<() => Promise<void>>();
vi.mock("@/db/client", () => ({ pingDb: () => pingDb() }));

import { GET } from "./route";

describe("GET /api/health", () => {
  const ORIGINAL = { ...process.env };

  beforeEach(() => {
    pingDb.mockReset();
    delete process.env.RESEND_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it("returns 200 with database ok when the DB is reachable", async () => {
    pingDb.mockResolvedValue();
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks.database).toBe("ok");
  });

  it("returns 503 with database error when the DB is unreachable", async () => {
    pingDb.mockRejectedValue(new Error("connection refused"));
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body.checks.database).toBe("error");
  });

  it("reports email/llm as not_configured when keys are absent", async () => {
    pingDb.mockResolvedValue();
    const res = await GET();
    const body = await res.json();
    expect(body.checks.email).toBe("not_configured");
    expect(body.checks.llm).toBe("not_configured");
  });

  it("reports email/llm as ok when keys are present (without calling them)", async () => {
    pingDb.mockResolvedValue();
    process.env.RESEND_API_KEY = "re_test";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const res = await GET();
    const body = await res.json();
    expect(body.checks.email).toBe("ok");
    expect(body.checks.llm).toBe("ok");
  });

  it("never leaks a DB error message in the response body", async () => {
    pingDb.mockRejectedValue(
      new Error("postgresql://user:secretpw@host:6543/postgres failed"),
    );
    const res = await GET();
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("secretpw");
  });
});
