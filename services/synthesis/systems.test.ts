import { describe, it, expect, vi, beforeEach } from "vitest";

const completeStructured = vi.fn();
vi.mock("@/services/llm/client", () => ({
  completeStructured: (...args: unknown[]) => completeStructured(...args),
}));

import { clusterSystems } from "./systems";

const ID = {
  a: "11111111-1111-4111-8111-111111111111",
  b: "22222222-2222-4222-8222-222222222222",
  c: "33333333-3333-4333-8333-333333333333",
};

beforeEach(() => completeStructured.mockReset());

describe("clusterSystems (Ticket F)", () => {
  it("short-circuits without an LLM call when no tooling/workaround captures", async () => {
    const out = await clusterSystems([
      { id: ID.a, kind: "frustration", summary: "slow" },
    ]);
    expect(out).toEqual([]);
    expect(completeStructured).not.toHaveBeenCalled();
  });

  it("only passes tooling/workaround captures to the model", async () => {
    completeStructured.mockResolvedValue({ items: [] });
    await clusterSystems([
      { id: ID.a, kind: "tooling", summary: "uses NetSuite" },
      { id: ID.b, kind: "workaround", summary: "exports to a spreadsheet" },
      { id: ID.c, kind: "decision", summary: "VP signs off" },
    ]);
    const content = completeStructured.mock.calls[0][0].messages[0]
      .content as string;
    expect(content).toContain(ID.a);
    expect(content).toContain(ID.b);
    expect(content).not.toContain(ID.c);
  });

  it("drops items whose captureIds aren't real input ids", async () => {
    completeStructured.mockResolvedValue({
      items: [
        {
          name: "Pricing spreadsheet",
          category: "shadow_tool",
          summary: "shared sheet for custom pricing",
          captureIds: [ID.a],
        },
        {
          name: "Ghost tool",
          category: "system",
          summary: "hallucinated",
          captureIds: ["99999999-9999-4999-8999-999999999999"],
        },
      ],
    });
    const out = await clusterSystems([
      { id: ID.a, kind: "workaround", summary: "spreadsheet" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Pricing spreadsheet");
  });
});
