import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TranscriptView } from "./TranscriptView";
import type { SessionTranscript } from "@/lib/types";

const transcript: SessionTranscript = {
  topicTitle: "When things break",
  contributorName: "Cara Stone",
  contributorRole: "AR Specialist",
  status: "completed",
  completedAt: "May 22, 2026",
  messages: [
    {
      id: "m1",
      role: "assistant",
      content: "How does a credit hold get cleared?",
      arc: "ARC_1",
    },
    {
      id: "m2",
      role: "user",
      content: "Someone in finance clears it once a day.",
      arc: "ARC_1",
    },
  ],
};

describe("TranscriptView", () => {
  it("renders the topic, contributor name + role, and both message turns", () => {
    render(
      <TranscriptView
        transcript={transcript}
        backHref="/admin/clients/t1/sprint/s1/report"
      />,
    );

    expect(
      screen.getByRole("heading", { name: /when things break/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Cara Stone")).toBeInTheDocument();
    expect(screen.getByText(/AR Specialist/)).toBeInTheDocument();
    expect(
      screen.getByText(/how does a credit hold get cleared/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/someone in finance clears it once a day/i),
    ).toBeInTheDocument();
  });

  it("shows an empty state when there are no messages", () => {
    render(
      <TranscriptView
        transcript={{ ...transcript, messages: [] }}
        backHref="/x"
      />,
    );
    expect(screen.getByText(/no messages recorded/i)).toBeInTheDocument();
  });
});
