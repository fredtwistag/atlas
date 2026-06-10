import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { OpportunityCard } from "./OpportunityCard";
import type { Opportunity } from "@/lib/types";

const opp: Opportunity = {
  id: "o1",
  sprintId: "s1",
  title: "Automate credit-hold release",
  description: "",
  category: "Ops",
  departments: [],
  impactLow: 100_000,
  impactHigh: 200_000,
  timeToShipWeeksLow: 2,
  timeToShipWeeksHigh: 4,
  confidenceScore: 5,
  compositeScore: 8.4,
  dimensionScores: [],
  rationale: "",
  status: "surfaced",
  evidence: [],
  contributorCount: 3,
};

describe("OpportunityCard", () => {
  it("renders a link when href is provided", () => {
    render(<OpportunityCard opp={opp} href="/sprint/s1/opportunity/o1" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/sprint/s1/opportunity/o1");
    expect(
      screen.getByText("Automate credit-hold release"),
    ).toBeInTheDocument();
  });

  it("renders a plain, non-interactive card when href is omitted", () => {
    render(<OpportunityCard opp={opp} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.getByText("Automate credit-hold release"),
    ).toBeInTheDocument();
  });
});
