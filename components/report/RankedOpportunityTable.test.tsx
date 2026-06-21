// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RankedOpportunityTable } from "./RankedOpportunityTable";
import type { Opportunity } from "@/lib/types";

const opp = (id: string, n: number, title: string): Opportunity =>
  ({ id, compositeScore: n, title, impactLow: 10000, impactHigh: 20000, category: "Ops" }) as unknown as Opportunity;

describe("RankedOpportunityTable", () => {
  it("renders a row per opportunity with a link when href is given", () => {
    render(<RankedOpportunityTable opps={[opp("o4", 5.2, "Fourth"), opp("o5", 4.8, "Fifth")]} currency="EUR" startRank={4} href={(id) => `/o/${id}`} />);
    expect(screen.getByText("Fourth")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Fifth/ })).toBeTruthy();
  });
});
