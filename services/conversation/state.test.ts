import { describe, it, expect } from "vitest";
import {
  nextArc,
  isDone,
  arcIndex,
  arcName,
  ARCS,
  MAX_TURNS_PER_ARC,
  MAX_PROBES_PER_ARC,
  probesRemaining,
  type Arc,
} from "./state";

describe("nextArc — framing transitions", () => {
  it("INIT → INTRO regardless of turns", () => {
    expect(nextArc("INIT", 0)).toBe("INTRO");
    expect(nextArc("INIT", 9)).toBe("INTRO");
  });

  it("INTRO → ARC_1 regardless of turns", () => {
    expect(nextArc("INTRO", 0)).toBe("ARC_1");
    expect(nextArc("INTRO", 5)).toBe("ARC_1");
  });

  it("CLOSE → DONE", () => {
    expect(nextArc("CLOSE", 0)).toBe("DONE");
    expect(nextArc("CLOSE", 9)).toBe("DONE");
  });

  it("DONE is terminal", () => {
    expect(nextArc("DONE", 0)).toBe("DONE");
    expect(nextArc("DONE", 100)).toBe("DONE");
  });
});

describe("nextArc — interview arc budget", () => {
  const seq: Array<[Arc, Arc]> = [
    ["ARC_1", "ARC_2"],
    ["ARC_2", "ARC_3"],
    ["ARC_3", "ARC_4"],
    ["ARC_4", "CLOSE"],
  ];

  for (const [from, to] of seq) {
    it(`${from} stays until budget then advances to ${to}`, () => {
      // Below budget → stay.
      expect(nextArc(from, 0)).toBe(from);
      expect(nextArc(from, MAX_TURNS_PER_ARC - 1)).toBe(from);
      // At/over budget → advance.
      expect(nextArc(from, MAX_TURNS_PER_ARC)).toBe(to);
      expect(nextArc(from, MAX_TURNS_PER_ARC + 2)).toBe(to);
    });
  }
});

describe("isDone", () => {
  it("is true only for DONE", () => {
    for (const arc of ARCS) {
      expect(isDone(arc)).toBe(arc === "DONE");
    }
  });
});

describe("probesRemaining", () => {
  it("offers the full budget for the anchor turn", () => {
    expect(probesRemaining(0)).toBe(MAX_PROBES_PER_ARC);
    expect(probesRemaining(1)).toBe(MAX_PROBES_PER_ARC);
  });

  it("spends one probe per subsequent turn, never going negative", () => {
    expect(probesRemaining(2)).toBe(1);
    expect(probesRemaining(3)).toBe(0);
    expect(probesRemaining(9)).toBe(0);
  });
});

describe("arcIndex", () => {
  it("numbers the four interview arcs 1..4", () => {
    expect(arcIndex("ARC_1")).toBe(1);
    expect(arcIndex("ARC_2")).toBe(2);
    expect(arcIndex("ARC_3")).toBe(3);
    expect(arcIndex("ARC_4")).toBe(4);
  });

  it("returns null for framing states", () => {
    for (const arc of ["INIT", "INTRO", "CLOSE", "DONE"] as Arc[]) {
      expect(arcIndex(arc)).toBeNull();
    }
  });
});

describe("arcName", () => {
  it("names every arc (total coverage of the union)", () => {
    for (const arc of ARCS) {
      expect(arcName(arc).length).toBeGreaterThan(0);
    }
  });

  it("uses the docs/03 arc names for the interview arcs", () => {
    expect(arcName("ARC_1")).toBe("Workflow walkthrough");
    expect(arcName("ARC_2")).toBe("Frustration mining");
    expect(arcName("ARC_3")).toBe("Edge cases & exceptions");
    expect(arcName("ARC_4")).toBe("Tools & constraints");
  });
});

describe("a full session walk", () => {
  it("INIT → INTRO → ARC_1..4 → CLOSE → DONE under the budget", () => {
    let arc: Arc = "INIT";
    const visited: Arc[] = [arc];
    // Drive each arc to its budget; framing arcs ignore the count.
    for (let i = 0; i < 20 && arc !== "DONE"; i++) {
      arc = nextArc(arc, MAX_TURNS_PER_ARC);
      visited.push(arc);
    }
    expect(visited).toEqual([
      "INIT",
      "INTRO",
      "ARC_1",
      "ARC_2",
      "ARC_3",
      "ARC_4",
      "CLOSE",
      "DONE",
    ]);
  });
});
