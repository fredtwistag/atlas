import { describe, it, expect, vi, beforeEach } from "vitest";

const mockComplete = vi.fn();
vi.mock("@/services/llm/client", () => ({
  completeStructured: (...args: unknown[]) => mockComplete(...args),
}));

import { generateSynthesisMemo } from "./memo";

beforeEach(() => mockComplete.mockReset());

describe("generateSynthesisMemo (Ticket G)", () => {
  it("returns empty fields without an LLM call when there is no portfolio", async () => {
    const memo = await generateSynthesisMemo({
      tenantName: "Northwind",
      portfolio: [],
      stakeholders: [],
      adoptionRisk: [],
    });
    expect(memo.openingNarrative).toBe("");
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("feeds portfolio, stakeholders and risk into the prompt", async () => {
    mockComplete.mockResolvedValue({
      openingNarrative: "o",
      portfolioStory: "p",
      sequencingLogic: "s",
      riskNarrative: "r",
      recommendedNextStep: "n",
    });
    await generateSynthesisMemo({
      tenantName: "Northwind",
      portfolio: [
        {
          title: "Automate pricing",
          horizon: "quick_win",
          inclusionRationale: "fast proof",
        },
      ],
      stakeholders: [{ roleLabel: "VP Sales", type: "decision_maker" }],
      adoptionRisk: [{ department: "Sales", level: "high" }],
    });
    const content = mockComplete.mock.calls[0][0].messages[0].content as string;
    expect(content).toContain("Automate pricing");
    expect(content).toContain("VP Sales");
    expect(content).toContain("Sales: high resistance");
  });
});
