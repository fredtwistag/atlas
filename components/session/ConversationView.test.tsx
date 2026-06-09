import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { ConversationView } from "./ConversationView";

describe("ConversationView", () => {
  it("shows the opening question and an empty capture panel", () => {
    render(<ConversationView sessionId="ses-4" topicTitle="One change" />);
    expect(
      screen.getByText(/walk me through what happens/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/0/)).toBeInTheDocument();
  });

  it("surfaces a capture after the user replies", async () => {
    render(<ConversationView sessionId="ses-4" topicTitle="One change" />);
    const box = screen.getByLabelText("Your message");
    await userEvent.type(box, "It lands in a queue and some get stuck.");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    // The scripted assistant follow-up appears.
    expect(
      await screen.findByText(/what makes one stick/i),
    ).toBeInTheDocument();
    // A capture is surfaced in the side panel.
    expect(
      await screen.findByText(/New orders enter a shared queue/i),
    ).toBeInTheDocument();
  });
});
