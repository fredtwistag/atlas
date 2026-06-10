import { describe, it, expect } from "vitest";
import { usdShort, usdRange } from "./format";

describe("usdShort", () => {
  it("formats sub-thousands verbatim", () => {
    expect(usdShort(500)).toBe("$500");
    expect(usdShort(999)).toBe("$999");
  });

  it("formats thousands with a K suffix", () => {
    expect(usdShort(1_000)).toBe("$1K");
    expect(usdShort(12_000)).toBe("$12K");
    expect(usdShort(920_000)).toBe("$920K");
  });

  it("formats millions with an M suffix, trimming a whole number", () => {
    expect(usdShort(1_000_000)).toBe("$1M");
    expect(usdShort(1_500_000)).toBe("$1.5M");
  });
});

describe("usdRange", () => {
  it("joins low and high with an en dash", () => {
    expect(usdRange(480_000, 920_000)).toBe("$480K–$920K");
  });
});
