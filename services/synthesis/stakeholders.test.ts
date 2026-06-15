import { describe, it, expect, vi, beforeEach } from "vitest";

const completeStructured = vi.fn();
vi.mock("@/services/llm/client", () => ({
  completeStructured: (...args: unknown[]) => completeStructured(...args),
}));

import { mapStakeholders } from "./stakeholders";

const OPP = "11111111-1111-4111-8111-111111111111";

beforeEach(() => completeStructured.mockReset());

describe("mapStakeholders (Ticket B)", () => {
  it("short-circuits without an LLM call when there are no decision/handoff captures", async () => {
    const out = await mapStakeholders({
      captures: [{ kind: "frustration", summary: "slow", role: "AE" }],
      opportunities: [{ id: OPP, title: "Automate pricing" }],
      roles: ["AE"],
    });
    expect(out).toEqual([]);
    expect(completeStructured).not.toHaveBeenCalled();
  });

  it("drops gatedOpportunityIds that aren't real sprint opportunities", async () => {
    completeStructured.mockResolvedValue({
      stakeholders: [
        {
          roleLabel: "VP Sales",
          department: "Sales",
          type: "decision_maker",
          summary: "Gates pricing.",
          gatedOpportunityIds: [OPP, "99999999-9999-4999-8999-999999999999"],
        },
      ],
    });
    const out = await mapStakeholders({
      captures: [
        { kind: "decision", summary: "VP signs off on pricing", role: "AE" },
      ],
      opportunities: [{ id: OPP, title: "Automate pricing" }],
      roles: ["AE", "VP Sales"],
    });
    expect(out).toHaveLength(1);
    expect(out[0].gatedOpportunityIds).toEqual([OPP]);
  });

  it("passes only decision/handoff captures to the model", async () => {
    completeStructured.mockResolvedValue({ stakeholders: [] });
    await mapStakeholders({
      captures: [
        { kind: "decision", summary: "VP signs off", role: "AE" },
        { kind: "handoff", summary: "Sales → Finance", role: "AE" },
        { kind: "tooling", summary: "uses Salesforce", role: "AE" },
      ],
      opportunities: [],
      roles: ["AE"],
    });
    const content = completeStructured.mock.calls[0][0].messages[0]
      .content as string;
    expect(content).toContain("VP signs off");
    expect(content).toContain("Sales → Finance");
    expect(content).not.toContain("uses Salesforce");
  });
});
