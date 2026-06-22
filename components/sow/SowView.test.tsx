import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SowView } from "./SowView";
import type { SowDetail } from "@/lib/types";

const sow: SowDetail = {
  title: "Credit-hold automation engagement",
  scope: "Automate the rules-based majority of credit-hold releases.",
  inclusions: ["Rules engine", "Edge-case routing"],
  exclusions: ["ERP migration"],
  team: [{ role: "FDE", allocation: "Full-time" }],
  durationWeeks: 6,
  priceUsd: 60_000,
  successMetrics: ["Release latency < 1h"],
  status: "draft",
};

describe("SowView", () => {
  it("renders the SOW fields, price in the tenant currency, and a back link", () => {
    render(
      <SowView
        sow={sow}
        opportunityTitle="Automate credit-hold release"
        currency="GBP"
        backHref="/admin/clients/t1/sprint/s1/opportunity/o1"
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: /credit-hold automation engagement/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/SOW · draft/i)).toBeInTheDocument();
    expect(
      screen.getByText(/automate the rules-based majority/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Rules engine")).toBeInTheDocument();
    expect(screen.getByText("ERP migration")).toBeInTheDocument();
    expect(screen.getByText("FDE")).toBeInTheDocument();
    // GBP symbol, not the default EUR.
    expect(screen.getByText(/£60,000/)).toBeInTheDocument();

    const back = screen.getByRole("link", { name: /back to opportunity/i });
    expect(back).toHaveAttribute(
      "href",
      "/admin/clients/t1/sprint/s1/opportunity/o1",
    );
  });
});
