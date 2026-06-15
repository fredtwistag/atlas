import { describe, it, expect } from "vitest";
import { adoptionLevel } from "./adoption-risk";

describe("adoptionLevel (Ticket E)", () => {
  it("flags high resistance on a low change-mgmt score or many signals", () => {
    expect(adoptionLevel(3, 0)).toBe("high"); // low score
    expect(adoptionLevel(8, 4)).toBe("high"); // many signals despite good score
  });

  it("flags medium on a middling score or a couple of signals", () => {
    expect(adoptionLevel(6, 0)).toBe("medium");
    expect(adoptionLevel(9, 2)).toBe("medium");
  });

  it("flags low only when the score is healthy and signals are sparse", () => {
    expect(adoptionLevel(8, 1)).toBe("low");
    expect(adoptionLevel(7, 0)).toBe("low");
  });

  it("treats the boundaries deterministically", () => {
    expect(adoptionLevel(4, 0)).toBe("high"); // <=4 is high
    expect(adoptionLevel(4.1, 0)).toBe("medium"); // just above the high cutoff
  });
});
