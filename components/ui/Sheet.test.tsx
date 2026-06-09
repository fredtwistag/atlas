import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Sheet } from "./Sheet";

describe("Sheet", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <Sheet open={false} onClose={() => {}} title="T">
        body
      </Sheet>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("exposes a dialog role and title when open", () => {
    render(
      <Sheet open onClose={() => {}} title="Approve">
        body
      </Sheet>,
    );
    expect(screen.getByRole("dialog", { name: "Approve" })).toBeInTheDocument();
  });

  it("calls onClose on Escape", async () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="Approve">
        body
      </Sheet>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
