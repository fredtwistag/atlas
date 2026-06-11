import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConversationView, type InitialMessage } from "./ConversationView";

/**
 * The view drives a live tRPC mutation (session.sendMessage). We mock the tRPC
 * client so the component logic — optimistic append, thinking state, capture
 * rail, error retry, single completion fire — can be tested without a server.
 */

type SendResult = {
  assistant: string;
  done: boolean;
  captures: { id: string; kind: string; summary: string }[];
};

// A controllable mutate(): the test installs the next outcome before each send.
let mutateImpl: (
  input: { id: string; content: string },
  opts: {
    onSuccess: (res: SendResult) => void;
    onError: (err: { message: string }) => void;
  },
) => void;
let isPending = false;

vi.mock("@/lib/trpc/react", () => ({
  trpc: {
    session: {
      sendMessage: {
        useMutation: () => ({
          mutate: (
            input: { id: string; content: string },
            opts: {
              onSuccess: (res: SendResult) => void;
              onError: (err: { message: string }) => void;
            },
          ) => mutateImpl(input, opts),
          isPending,
        }),
      },
    },
  },
}));

const INTRO: InitialMessage[] = [
  {
    role: "assistant",
    content: "Walk me through what happens when a new order comes in.",
    arc: "INTRO",
  },
];

function succeedWith(res: SendResult) {
  mutateImpl = (_input, opts) => opts.onSuccess(res);
}
function failWith(message: string) {
  mutateImpl = (_input, opts) => opts.onError({ message });
}

describe("ConversationView", () => {
  beforeEach(() => {
    isPending = false;
    mutateImpl = () => {};
  });

  it("renders prior turns and an empty capture panel", () => {
    render(
      <ConversationView
        sessionId="ses-4"
        topicTitle="One change"
        initialMessages={INTRO}
      />,
    );
    expect(
      screen.getByText(/walk me through what happens/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the moments worth acting on will show up here/i),
    ).toBeInTheDocument();
  });

  it("renders a resumed half-done transcript (assistant + user turns)", () => {
    render(
      <ConversationView
        sessionId="ses-4"
        topicTitle="One change"
        initialMessages={[
          ...INTRO,
          { role: "user", content: "It lands in a queue.", arc: "ARC_1" },
          { role: "assistant", content: "What makes one stick?", arc: "ARC_1" },
        ]}
      />,
    );
    expect(screen.getByText(/it lands in a queue/i)).toBeInTheDocument();
    expect(screen.getByText(/what makes one stick/i)).toBeInTheDocument();
  });

  it("optimistically shows the user message, then the reply and a capture", async () => {
    succeedWith({
      assistant: "Got it — credit holds. Who clears them?",
      done: false,
      captures: [
        {
          id: "cap-1",
          kind: "bottleneck",
          summary: "New orders enter a shared queue.",
        },
      ],
    });
    render(
      <ConversationView
        sessionId="ses-4"
        topicTitle="One change"
        initialMessages={INTRO}
      />,
    );

    const box = screen.getByLabelText("Your message");
    await userEvent.type(box, "Some orders get stuck.");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    // Optimistic user bubble.
    expect(screen.getByText("Some orders get stuck.")).toBeInTheDocument();
    // Assistant reply.
    expect(await screen.findByText(/who clears them/i)).toBeInTheDocument();
    // Capture surfaced in the rail.
    expect(
      screen.getByText(/New orders enter a shared queue/i),
    ).toBeInTheDocument();
    // The composer is cleared after a successful send.
    expect(screen.getByLabelText("Your message")).toHaveValue("");
  });

  it("on error preserves the draft, rolls back the bubble, and offers retry", async () => {
    failWith("Network blip");
    render(
      <ConversationView
        sessionId="ses-4"
        topicTitle="One change"
        initialMessages={INTRO}
      />,
    );

    const box = screen.getByLabelText("Your message");
    await userEvent.type(box, "Some orders get stuck.");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    // Honest, fixable error copy (no "Something went wrong").
    expect(
      await screen.findByText(/Atlas couldn't reply\. Your answer is saved/i),
    ).toBeInTheDocument();
    // Draft restored so the IC doesn't retype.
    expect(screen.getByLabelText("Your message")).toHaveValue(
      "Some orders get stuck.",
    );
    // Optimistic bubble was rolled back (only the original message bubble shows,
    // not a second copy as a user turn).
    const matches = screen.getAllByText("Some orders get stuck.");
    expect(matches).toHaveLength(1); // the textarea value, not a chat bubble

    // Retry now succeeds.
    succeedWith({
      assistant: "Thanks — got it.",
      done: false,
      captures: [],
    });
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/thanks — got it/i)).toBeInTheDocument();
  });

  it("surfaces the ANTHROPIC_API_KEY message verbatim", async () => {
    failWith(
      "Conversation engine not configured — set ANTHROPIC_API_KEY to start a session.",
    );
    render(
      <ConversationView
        sessionId="ses-4"
        topicTitle="One change"
        initialMessages={INTRO}
      />,
    );
    await userEvent.type(screen.getByLabelText("Your message"), "Hi");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByText(/set ANTHROPIC_API_KEY to start a session/i),
    ).toBeInTheDocument();
  });

  it("fires onComplete exactly once when done is returned", async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    succeedWith({
      assistant: "That lands. Thank you.",
      done: true,
      captures: [],
    });
    render(
      <ConversationView
        sessionId="ses-4"
        topicTitle="One change"
        initialMessages={INTRO}
        onComplete={onComplete}
      />,
    );

    await userEvent.type(
      screen.getByLabelText("Your message"),
      "Final answer.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    // Completion state replaces the composer.
    expect(await screen.findByText(/Session captured/i)).toBeInTheDocument();
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith("ses-4");
  });
});
