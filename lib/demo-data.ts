/**
 * Demo-only fixtures. The IC conversation is still a scripted 5-turn mock — the
 * real conversation engine (docs/03-conversational-engine.md, services/conversation/)
 * is not built yet. Keep demo content here, quarantined from production data
 * paths, so lib/data.ts can shrink toward deletion as real slices land.
 */
interface ScriptStep {
  assistant: string;
  /** A capture the extraction pass would lift from the user's reply to the PREVIOUS question. */
  captureOnReply?: { kind: string; summary: string };
}

export const conversationScript: ScriptStep[] = [
  {
    assistant:
      "Thanks for making time, Priya. No right answers here — I'm just trying to understand how order operations actually run day to day.\n\nTo start: walk me through what happens when a new order comes in. Where does it go first?",
  },
  {
    assistant:
      "That's helpful. So it lands in the queue and you pick it up. When you say some orders “get stuck” before you can release them — what makes one stick?",
    captureOnReply: {
      kind: "bottleneck",
      summary:
        "New orders enter a shared queue and are worked manually in order of arrival.",
    },
  },
  {
    assistant:
      "Got it — credit holds. And when one trips a hold, who actually clears it, and how long does that usually take?",
    captureOnReply: {
      kind: "handoff",
      summary:
        "Orders that trip a credit check are blocked until Finance reviews them.",
    },
  },
  {
    assistant:
      "So it waits for the daily pass in Finance. Last question on this thread: when you're waiting on that release, what do the downstream folks — warehouse, the customer — experience?",
    captureOnReply: {
      kind: "frustration",
      summary:
        "Credit-hold releases wait for a once-daily manual review, often overnight.",
    },
  },
  {
    assistant:
      "That lands. You've given me a really clear picture of where the credit-hold step slows everything down — I've captured a few things on the right as we talked. Want to keep going into tools next, or pause here? Either is fine.",
    captureOnReply: {
      kind: "handoff",
      summary:
        "Warehouse picking and customers both stall waiting on credit-hold release.",
    },
  },
];
