import { describe, it, expect } from "vitest";
import { moneyShort, moneyRange } from "./format";

describe("moneyShort", () => {
  it("formats EUR by default", () => {
    expect(moneyShort(28_000)).toBe("€28K");
    expect(moneyShort(1_500_000)).toBe("€1.5M");
    expect(moneyShort(900)).toBe("€900");
  });
  it("honors an explicit currency", () => {
    expect(moneyShort(28_000, "USD")).toBe("$28K");
  });
});

describe("moneyRange", () => {
  it("formats an EUR range", () => {
    expect(moneyRange(28_000, 65_000)).toBe("€28K–€65K");
  });
});
