import { describe, it, expect } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("accepts a same-origin relative path", () => {
    expect(safeNext("/me")).toBe("/me");
  });

  it("accepts a relative path with a query string", () => {
    expect(safeNext("/sprint?tab=report")).toBe("/sprint?tab=report");
  });

  it("rejects a value that does not start with a slash", () => {
    expect(safeNext(".evil.com/x")).toBeNull();
  });

  it("rejects a protocol-relative URL (//host)", () => {
    expect(safeNext("//evil.com")).toBeNull();
  });

  it("rejects a backslash protocol-relative URL (/\\host)", () => {
    expect(safeNext("/\\evil.com")).toBeNull();
  });

  it("rejects an absolute URL with a scheme", () => {
    expect(safeNext("https://evil.com")).toBeNull();
  });

  it("rejects any value containing a colon", () => {
    expect(safeNext("/path:with:colon")).toBeNull();
  });

  it("rejects null and empty string", () => {
    expect(safeNext(null)).toBeNull();
    expect(safeNext("")).toBeNull();
  });
});
