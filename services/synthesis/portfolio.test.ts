import { describe, it, expect } from "vitest";
import { selectPortfolio, type PortfolioCandidate } from "./portfolio";
import type { Horizon } from "@/lib/types";

let n = 0;
function cand(over: Partial<PortfolioCandidate> = {}): PortfolioCandidate {
  n += 1;
  return {
    id: `op-${n}`,
    title: `Opportunity ${n}`,
    horizon: "standard" as Horizon,
    departments: ["Ops"],
    compositeScore: 6,
    confidenceScore: 4,
    ...over,
  };
}

describe("selectPortfolio (Ticket A)", () => {
  it("returns 3-5 items and includes a quick win and a strategic bet when available", () => {
    const candidates = [
      cand({
        horizon: "strategic_bet",
        compositeScore: 9,
        departments: ["Sales"],
      }),
      cand({
        horizon: "standard",
        compositeScore: 8,
        departments: ["Finance"],
      }),
      cand({ horizon: "standard", compositeScore: 7, departments: ["Ops"] }),
      cand({ horizon: "quick_win", compositeScore: 5, departments: ["CS"] }),
    ];
    const { items, underfilled } = selectPortfolio(candidates);
    expect(underfilled).toBe(false);
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.length).toBeLessThanOrEqual(5);
    const horizons = items.map(
      (it) => candidates.find((c) => c.id === it.opportunityId)!.horizon,
    );
    expect(horizons).toContain("quick_win");
    expect(horizons).toContain("strategic_bet");
  });

  it("caps the portfolio at 5 even with many eligible candidates", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      cand({ compositeScore: 9 - i * 0.1 }),
    );
    expect(selectPortfolio(many).items).toHaveLength(5);
  });

  it("flags underfilled and does not pad when fewer than 3 are high-confidence", () => {
    const candidates = [
      cand({ confidenceScore: 4, compositeScore: 8 }),
      cand({ confidenceScore: 2, compositeScore: 9 }), // too low confidence
      cand({ confidenceScore: 1, compositeScore: 7 }),
    ];
    const { items, underfilled } = selectPortfolio(candidates);
    expect(underfilled).toBe(true);
    expect(items).toHaveLength(1); // only the one high-confidence opp
  });

  it("returns nothing for an empty input", () => {
    expect(selectPortfolio([])).toEqual({ items: [], underfilled: true });
  });

  it("sequences items by composite score (highest first)", () => {
    const candidates = [
      cand({ compositeScore: 5 }),
      cand({ compositeScore: 9 }),
      cand({ compositeScore: 7 }),
    ];
    const { items } = selectPortfolio(candidates);
    const scores = items.map(
      (it) => candidates.find((c) => c.id === it.opportunityId)!.compositeScore,
    );
    expect(scores[0]).toBeGreaterThanOrEqual(scores[scores.length - 1]);
  });
});
