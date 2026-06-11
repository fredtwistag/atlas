import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db layer: consume() derives allowed/retryAfter purely from the row the
// upsert returns, so the unit test feeds rows directly and asserts the math. The
// real SQL semantics (atomic upsert, window rollover, concurrency) are covered by
// db/rate-limits.integration.test.ts against an actual Postgres.
const executeMock = vi.fn();
const withServiceRoleMock = vi.fn(
  async (
    _audit: { action: string; actor: string; skipAudit?: boolean },
    fn: (tx: { execute: typeof executeMock }) => Promise<unknown>,
  ) => fn({ execute: executeMock }),
);

vi.mock("@/db/client", () => ({
  withServiceRole: (...args: Parameters<typeof withServiceRoleMock>) =>
    withServiceRoleMock(...args),
}));

import { consume } from "./rate-limit";

beforeEach(() => {
  executeMock.mockReset();
  withServiceRoleMock.mockClear();
});

describe("consume — window math", () => {
  it("allows when post-write count is at the limit", async () => {
    executeMock.mockResolvedValueOnce([{ count: 3, seconds_left: 120 }]);
    const res = await consume("signin-email:a@x.com", {
      limit: 3,
      windowSeconds: 600,
    });
    expect(res).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("blocks when post-write count exceeds the limit and reports retryAfter", async () => {
    executeMock.mockResolvedValueOnce([{ count: 4, seconds_left: 240 }]);
    const res = await consume("signin-email:a@x.com", {
      limit: 3,
      windowSeconds: 600,
    });
    expect(res).toEqual({ allowed: false, retryAfterSeconds: 240 });
  });

  it("rounds retryAfter up to whole seconds and never returns negative", async () => {
    executeMock.mockResolvedValueOnce([{ count: 6, seconds_left: 12.3 }]);
    const res = await consume("otp-verify:a@x.com", {
      limit: 5,
      windowSeconds: 900,
    });
    expect(res.allowed).toBe(false);
    expect(res.retryAfterSeconds).toBe(13);
  });

  it("clamps a negative seconds_left to 0 when blocked", async () => {
    executeMock.mockResolvedValueOnce([{ count: 21, seconds_left: -2 }]);
    const res = await consume("nudge-actor:u1", {
      limit: 20,
      windowSeconds: 86_400,
    });
    expect(res.allowed).toBe(false);
    expect(res.retryAfterSeconds).toBe(0);
  });

  it("coerces string-typed numerics from the driver", async () => {
    executeMock.mockResolvedValueOnce([{ count: "1", seconds_left: "599.9" }]);
    const res = await consume("signin-email-ip:1.2.3.4", {
      limit: 10,
      windowSeconds: 600,
    });
    expect(res.allowed).toBe(true);
    expect(res.retryAfterSeconds).toBe(0);
  });

  it("treats a missing row defensively (count 0 → allowed)", async () => {
    executeMock.mockResolvedValueOnce([]);
    const res = await consume("signin-email:a@x.com", {
      limit: 3,
      windowSeconds: 600,
    });
    expect(res.allowed).toBe(true);
    expect(res.retryAfterSeconds).toBe(0);
  });
});

describe("consume — audit suppression", () => {
  it("runs through withServiceRole with action rate.limit and skipAudit", async () => {
    executeMock.mockResolvedValueOnce([{ count: 1, seconds_left: 600 }]);
    await consume("signin-email:a@x.com", { limit: 3, windowSeconds: 600 });
    expect(withServiceRoleMock).toHaveBeenCalledTimes(1);
    const [audit] = withServiceRoleMock.mock.calls[0];
    expect(audit.action).toBe("rate.limit");
    expect(audit.skipAudit).toBe(true);
  });
});
