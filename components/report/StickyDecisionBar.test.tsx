// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StickyDecisionBar } from "./StickyDecisionBar";
import type { Opportunity } from "@/lib/types";

const opps = [{ id: "o1", title: "Top move", impactLow: 56000, impactHigh: 75000 } as unknown as Opportunity];

describe("StickyDecisionBar", () => {
  it("renders the top move + CTA when a link is given", () => {
    render(<StickyDecisionBar opps={opps} currency="EUR" opportunityHref={(id) => `/o/${id}`} isSponsor />);
    expect(screen.getByText("Top move")).toBeTruthy();
    expect(screen.getByRole("link", { name: /approve/i })).toBeTruthy();
  });
  it("renders nothing without a link (read-only view)", () => {
    const { container } = render(<StickyDecisionBar opps={opps} currency="EUR" />);
    expect(container.textContent).toBe("");
  });
});
