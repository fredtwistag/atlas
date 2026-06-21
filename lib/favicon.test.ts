import { describe, it, expect } from "vitest";
import { faviconUrl } from "./favicon";

describe("faviconUrl", () => {
  it("builds a service URL from a bare domain", () => {
    expect(faviconUrl("vizta.com")).toBe(
      "https://www.google.com/s2/favicons?domain=vizta.com&sz=64",
    );
  });
  it("extracts the host from a full URL", () => {
    expect(faviconUrl("https://vizta.pt/about")).toBe(
      "https://www.google.com/s2/favicons?domain=vizta.pt&sz=64",
    );
  });
  it("returns null for missing or unparseable input", () => {
    expect(faviconUrl(null)).toBeNull();
    expect(faviconUrl(undefined)).toBeNull();
    expect(faviconUrl("")).toBeNull();
    expect(faviconUrl("not a domain")).toBeNull();
  });
});
