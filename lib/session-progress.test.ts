import { describe, it, expect } from "vitest";
import { furthestArc, progressForArc } from "./session-progress";

describe("furthestArc", () => {
  it("returns INIT for an empty transcript", () => {
    expect(furthestArc([])).toBe("INIT");
  });

  it("picks the furthest-along arc regardless of order", () => {
    expect(furthestArc(["INTRO", "ARC_3", "ARC_1"])).toBe("ARC_3");
  });

  it("ignores null and unknown arc values", () => {
    expect(furthestArc([null, "bogus", "ARC_2"])).toBe("ARC_2");
  });
});

describe("progressForArc", () => {
  it("is 0 at INIT and never negative", () => {
    expect(progressForArc("INIT", false)).toBe(0);
  });

  it("advances monotonically across arcs", () => {
    const seq = ["INTRO", "ARC_1", "ARC_2", "ARC_3", "ARC_4", "CLOSE"] as const;
    const values = seq.map((a) => progressForArc(a, false));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it("never reaches 100 until done", () => {
    expect(progressForArc("CLOSE", false)).toBeLessThan(100);
    expect(progressForArc("CLOSE", true)).toBe(100);
  });

  it("forces 100 when done even mid-arc", () => {
    expect(progressForArc("ARC_2", true)).toBe(100);
  });
});
