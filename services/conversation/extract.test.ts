import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CapturedItem } from "@/services/llm/schemas";

// Mock the LLM layer: completeStructured returns whatever the test queues, so
// these tests exercise the prompt assembly + substring guard, not the model.
const completeStructured = vi.fn();
vi.mock("@/services/llm/client", () => ({
  completeStructured: (...args: unknown[]) => completeStructured(...args),
}));

import { extractFromTurn, extractFromSession } from "./extract";

function item(over: Partial<CapturedItem> = {}): CapturedItem {
  return {
    kind: "bottleneck",
    summary: "The AE re-keys the quote by hand.",
    sourceQuote: "I re-key the quote by hand every time",
    tags: [],
    ...over,
  };
}

beforeEach(() => {
  completeStructured.mockReset();
});

describe("extractFromTurn", () => {
  it("returns validated captures whose quotes appear in the user message", async () => {
    completeStructured.mockResolvedValue({ captures: [item()] });

    const out = await extractFromTurn({
      topicTitle: "Quote-to-cash",
      arc: "ARC_2",
      priorAssistant: "Where does it slow down?",
      userMessage:
        "Honestly, I re-key the quote by hand every time and it costs me an hour.",
    });

    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("bottleneck");
  });

  it("returns an empty array on small talk (valid empty result)", async () => {
    completeStructured.mockResolvedValue({ captures: [] });

    const out = await extractFromTurn({
      topicTitle: "Quote-to-cash",
      arc: "INTRO",
      priorAssistant: "Ready to start?",
      userMessage: "Sure, sounds good. Morning!",
    });

    expect(out).toEqual([]);
  });

  it("drops a capture whose sourceQuote is not a substring of the user message (no throw)", async () => {
    completeStructured.mockResolvedValue({
      captures: [
        item(), // quote IS present
        item({
          summary: "Fabricated thing the user never said.",
          sourceQuote: "we lose a million dollars a quarter to this",
        }),
      ],
    });

    const out = await extractFromTurn({
      topicTitle: "Quote-to-cash",
      arc: "ARC_2",
      priorAssistant: "Where does it slow down?",
      userMessage: "I re-key the quote by hand every time and it's tedious.",
    });

    expect(out).toHaveLength(1);
    expect(out[0].summary).toBe("The AE re-keys the quote by hand.");
  });

  it("matches quotes case-insensitively and across collapsed whitespace", async () => {
    completeStructured.mockResolvedValue({
      captures: [item({ sourceQuote: "RE-KEY  the   quote\nby hand" })],
    });

    const out = await extractFromTurn({
      topicTitle: "Quote-to-cash",
      arc: "ARC_2",
      priorAssistant: "Where does it slow down?",
      userMessage: "Every time I re-key the quote by hand.",
    });

    expect(out).toHaveLength(1);
  });

  it("does not log capture content", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    completeStructured.mockResolvedValue({
      captures: [item({ sourceQuote: "secret words here" })],
    });

    await extractFromTurn({
      topicTitle: "T",
      arc: "ARC_1",
      priorAssistant: null,
      userMessage: "secret words here in the message",
    });

    for (const call of [...log.mock.calls, ...warn.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain("secret words here");
    }
    log.mockRestore();
    warn.mockRestore();
  });
});

describe("extractFromSession", () => {
  it("skips the model entirely when the contributor said nothing", async () => {
    const out = await extractFromSession({
      topicTitle: "T",
      turns: [{ role: "assistant", content: "Opening question." }],
    });
    expect(out).toEqual([]);
    expect(completeStructured).not.toHaveBeenCalled();
  });

  it("validates quotes against the concatenated contributor turns", async () => {
    completeStructured.mockResolvedValue({
      captures: [
        item({ sourceQuote: "we escalate to finance on Slack" }),
        item({
          summary: "Never said this.",
          sourceQuote: "we have a fully automated pipeline",
        }),
      ],
    });

    const out = await extractFromSession({
      topicTitle: "Quote-to-cash",
      turns: [
        { role: "assistant", content: "Walk me through it." },
        { role: "user", content: "First we draft the quote." },
        { role: "assistant", content: "And exceptions?" },
        {
          role: "user",
          content: "When it breaks we escalate to finance on Slack.",
        },
      ],
    });

    expect(out).toHaveLength(1);
    expect(out[0].sourceQuote).toBe("we escalate to finance on Slack");
  });
});
