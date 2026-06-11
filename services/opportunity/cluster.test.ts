import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ClusterCapture } from "./cluster";

// Mock the LLM layer: completeStructured returns whatever the test queues, so
// these tests exercise clustering's guard logic, not the model.
const completeStructured = vi.fn();
vi.mock("@/services/llm/client", () => ({
  completeStructured: (...args: unknown[]) => completeStructured(...args),
}));

import { clusterCaptures } from "./cluster";

const ID = {
  a: "11111111-1111-4111-8111-111111111111",
  b: "22222222-2222-4222-8222-222222222222",
  c: "33333333-3333-4333-8333-333333333333",
  d: "44444444-4444-4444-8444-444444444444",
};

function cap(id: string, summary = "something operational"): ClusterCapture {
  return { id, kind: "bottleneck", summary };
}

beforeEach(() => {
  completeStructured.mockReset();
});

describe("clusterCaptures", () => {
  it("returns clusters of >=2 real captures (happy path)", async () => {
    completeStructured.mockResolvedValue({
      clusters: [{ theme: "Pricing approval delay", captureIds: [ID.a, ID.b] }],
    });

    const out = await clusterCaptures([cap(ID.a), cap(ID.b), cap(ID.c)]);

    expect(out).toHaveLength(1);
    expect(out[0].theme).toBe("Pricing approval delay");
    expect(out[0].captureIds).toEqual([ID.a, ID.b]);
  });

  it("short-circuits with no model call when fewer than 2 captures", async () => {
    const out = await clusterCaptures([cap(ID.a)]);
    expect(out).toEqual([]);
    expect(completeStructured).not.toHaveBeenCalled();
  });

  it("returns [] for empty input without calling the model", async () => {
    const out = await clusterCaptures([]);
    expect(out).toEqual([]);
    expect(completeStructured).not.toHaveBeenCalled();
  });

  it("drops a theme that collapses below 2 after removing unknown/duplicate ids", async () => {
    const unknown = "99999999-9999-4999-8999-999999999999";
    completeStructured.mockResolvedValue({
      clusters: [
        // a was already used in the first valid cluster; only `unknown` left -> drop
        { theme: "Real theme", captureIds: [ID.a, ID.b] },
        { theme: "Hallucinated", captureIds: [ID.a, unknown] },
      ],
    });

    const out = await clusterCaptures([cap(ID.a), cap(ID.b)]);

    expect(out).toHaveLength(1);
    expect(out[0].theme).toBe("Real theme");
  });

  it("never reuses a captureId across clusters", async () => {
    completeStructured.mockResolvedValue({
      clusters: [
        { theme: "T1", captureIds: [ID.a, ID.b] },
        { theme: "T2", captureIds: [ID.b, ID.c, ID.d] },
      ],
    });

    const out = await clusterCaptures([
      cap(ID.a),
      cap(ID.b),
      cap(ID.c),
      cap(ID.d),
    ]);

    const allIds = out.flatMap((c) => c.captureIds);
    expect(new Set(allIds).size).toBe(allIds.length);
    // b is consumed by T1, so T2 keeps only c + d
    expect(out[1].captureIds).toEqual([ID.c, ID.d]);
  });
});
