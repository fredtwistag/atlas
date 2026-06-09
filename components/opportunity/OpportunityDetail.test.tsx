import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { OpportunityDetail } from "./OpportunityDetail";
import { db, sowDraftFor } from "@/lib/data";

async function getFixtures() {
  const opp = (await db.opportunity.get("opp-1"))!;
  return { opp, sow: sowDraftFor(opp) };
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
