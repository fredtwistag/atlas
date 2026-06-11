import { describe, it, expect, vi, afterEach } from "vitest";
import { log } from "./log";

/**
 * These tests pin two things that matter:
 *  1. The SHAPE — one line of valid JSON with `level` + `event` + the fields.
 *  2. The CONVENTION — `fields` is typed to IDs/counts/flags only, so content
 *     (a transcript, a quote, an email) cannot be attached. The type enforces
 *     this at compile time; here we document the intent and prove the happy path
 *     stays content-free.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

function captureLine(
  level: "info" | "warn" | "error",
  fn: () => void,
): Record<string, unknown> {
  const spy = vi.spyOn(console, level).mockImplementation(() => {});
  fn();
  expect(spy).toHaveBeenCalledTimes(1);
  const arg = spy.mock.calls[0]?.[0];
  expect(typeof arg).toBe("string");
  return JSON.parse(arg as string) as Record<string, unknown>;
}

describe("log", () => {
  it("emits one line of JSON with level + event + fields", () => {
    const parsed = captureLine("info", () =>
      log.info("email.send.skipped", { tenantId: "t1", count: 0 }),
    );
    expect(parsed).toEqual({
      level: "info",
      event: "email.send.skipped",
      tenantId: "t1",
      count: 0,
    });
  });

  it("routes warn/error to the matching console method", () => {
    const warn = captureLine("warn", () => log.warn("extract.empty"));
    expect(warn.level).toBe("warn");
    expect(warn.event).toBe("extract.empty");

    const err = captureLine("error", () =>
      log.error("llm.complete.failed", { area: "llm" }),
    );
    expect(err.level).toBe("error");
    expect(err.event).toBe("llm.complete.failed");
    expect(err.area).toBe("llm");
  });

  it("works with no fields (defaults to {})", () => {
    const parsed = captureLine("info", () => log.info("jobs.tick"));
    expect(parsed).toEqual({ level: "info", event: "jobs.tick" });
  });

  it("CONVENTION: fields carry IDs/counts/flags only, never content", () => {
    // The field type is Record<string, string | number | boolean>. A caller
    // that tries to attach an object/array/Error does not compile — so the
    // privacy rule (no transcript/quote/email in logs) is mechanical, not a
    // matter of discipline at each call site. This test documents that the
    // sanctioned fields are scalars and the output contains exactly them.
    const parsed = captureLine("info", () =>
      log.info("session.turn.persisted", {
        tenantId: "t1",
        sessionId: "s1",
        userId: "u1",
        captured: 3,
        configured: true,
      }),
    );
    expect(Object.keys(parsed).sort()).toEqual(
      ["captured", "configured", "event", "level", "sessionId", "tenantId", "userId"].sort(),
    );
    // No value is an object/array — everything is a scalar.
    for (const v of Object.values(parsed)) {
      expect(["string", "number", "boolean"]).toContain(typeof v);
    }
  });
});
