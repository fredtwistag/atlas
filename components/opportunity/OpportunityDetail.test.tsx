import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { OpportunityDetail } from "./OpportunityDetail";
import { db } from "@/lib/data";
import { buildSowDraft } from "@/lib/sow";

async function getFixtures() {
  const opp = (await db.opportunity.get("opp-1"))!;
  return { opp, sow: buildSowDraft(opp, "Northwind Logistics") };
}

describe("OpportunityDetail approve flow", () => {
  it("opens the SOW sheet and confirms approval", async () => {
    const { opp, sow } = await getFixtures();
    render(
      <OpportunityDetail sprintId="spr-northwind-q2" opp={opp} sow={sow} />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /approve for fde engagement/i }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(sow.title)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /send to twistag/i }),
    );
    expect(screen.getByText(/approved for fde/i)).toBeInTheDocument();
  });
});

describe("OpportunityDetail read-only (Twistag admin view)", () => {
  it("hides the approve action and links back to the admin report", async () => {
    const { opp } = await getFixtures();
    render(
      <OpportunityDetail
        sprintId="spr-northwind-q2"
        opp={opp}
        readOnly
        backHref="/admin/clients/t1/sprint/spr-northwind-q2/report"
        backLabel="Back to report"
      />,
    );

    // No approve affordance for Twistag staff — approval stays with the client.
    expect(
      screen.queryByRole("button", { name: /approve/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/read-only view/i)).toBeInTheDocument();

    const back = screen.getByRole("link", { name: /back to report/i });
    expect(back).toHaveAttribute(
      "href",
      "/admin/clients/t1/sprint/spr-northwind-q2/report",
    );

    // Evidence is still fully rendered — the point of the drill-down.
    expect(screen.getByRole("tab", { name: /evidence/i })).toBeInTheDocument();
  });
});

describe("OpportunityDetail tabs (a11y)", () => {
  it("exposes a tablist with the active tab selected", async () => {
    const { opp, sow } = await getFixtures();
    render(
      <OpportunityDetail sprintId="spr-northwind-q2" opp={opp} sow={sow} />,
    );

    expect(screen.getByRole("tablist")).toBeInTheDocument();
    const evidence = screen.getByRole("tab", { name: /evidence/i });
    const patterns = screen.getByRole("tab", { name: /patterns/i });
    expect(evidence).toHaveAttribute("aria-selected", "true");
    expect(patterns).toHaveAttribute("aria-selected", "false");
    // The active panel is labelled by its tab.
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      evidence.id,
    );
  });

  it("moves selection with the right arrow key (roving focus)", async () => {
    const { opp, sow } = await getFixtures();
    render(
      <OpportunityDetail sprintId="spr-northwind-q2" opp={opp} sow={sow} />,
    );

    const evidence = screen.getByRole("tab", { name: /evidence/i });
    evidence.focus();
    expect(evidence).toHaveFocus();

    await userEvent.keyboard("{ArrowRight}");
    const patterns = screen.getByRole("tab", { name: /patterns/i });
    expect(patterns).toHaveAttribute("aria-selected", "true");
    expect(patterns).toHaveFocus();
    expect(evidence).toHaveAttribute("aria-selected", "false");
    expect(evidence).toHaveAttribute("tabindex", "-1");
    expect(patterns).toHaveAttribute("tabindex", "0");
  });

  it("wraps from the first tab to the last with the left arrow key", async () => {
    const { opp, sow } = await getFixtures();
    render(
      <OpportunityDetail sprintId="spr-northwind-q2" opp={opp} sow={sow} />,
    );

    const evidence = screen.getByRole("tab", { name: /evidence/i });
    evidence.focus();
    await userEvent.keyboard("{ArrowLeft}");
    const discussion = screen.getByRole("tab", { name: /discussion/i });
    expect(discussion).toHaveAttribute("aria-selected", "true");
    expect(discussion).toHaveFocus();
  });
});
