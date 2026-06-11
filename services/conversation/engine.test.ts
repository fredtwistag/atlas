import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM so no network call happens; echo the arc/system so we can assert.
// Keep LlmOutputError real so the engine's `instanceof` check works.
const complete = vi.fn();
vi.mock("@/services/llm/client", async (orig) => {
  const actual = await orig<typeof import("@/services/llm/client")>();
  return {
    ...actual,
    complete: (...args: unknown[]) => complete(...args),
  };
});

// Mock the extraction pass: the engine's persistence + count logic is under
// test here, not the prompt/guard (that's extract.test.ts).
const extractFromTurn = vi.fn();
vi.mock("./extract", () => ({
  extractFromTurn: (...args: unknown[]) => extractFromTurn(...args),
}));

import { takeTurn, openSession } from "./engine";
import { LlmOutputError } from "@/services/llm/client";
import type { Db } from "@/db/client";

/**
 * A hand-rolled fake of the slice of Drizzle the engine uses. It serves a fixed
 * session context + a configurable transcript, and records inserts/updates.
 *
 * - select(): returns a thenable chain. The FIRST select() in a call is the
 *   context join (resolves to one context row); every later select() is the
 *   history read (resolves to `history`).
 * - insert().values(rows): pushes onto `inserted`.
 * - update().set(patch).where(): pushes onto `updated`.
 */
function makeDb(history: { role: string; content: string; arc: string }[]) {
  const inserted: Array<Record<string, unknown>[]> = [];
  const updated: Array<Record<string, unknown>> = [];
  let selectCount = 0;

  const contextRow = {
    userName: "Sam Rivera",
    department: "Finance",
    userRole: "ic",
    topicTitle: "Quote-to-cash handoffs",
    topicDescription: "How a quote becomes cash.",
  };

  function chain(resolve: () => unknown[]) {
    const proxy: Record<string, unknown> = {};
    for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy"]) {
      proxy[m] = () => proxy;
    }
    // Thenable: awaiting the chain resolves to the rows.
    proxy.then = (onF: (v: unknown[]) => unknown) => onF(resolve());
    return proxy;
  }

  const db = {
    select() {
      const isContext = selectCount === 0;
      selectCount++;
      return chain(() => (isContext ? [contextRow] : history));
    },
    insert() {
      return {
        values(rows: Record<string, unknown>[]) {
          const batch = Array.isArray(rows) ? rows : [rows];
          inserted.push(batch);
          // Thenable (message inserts await it directly) that also offers
          // .returning() (capture inserts read back ids/kind/summary).
          return {
            then: (onF: (v: unknown) => unknown) => onF(undefined),
            returning: () =>
              Promise.resolve(
                batch.map((r, i) => ({
                  id: `cap-${i}`,
                  kind: r.kind,
                  summary: r.summary,
                })),
              ),
          };
        },
      };
    },
    update() {
      return {
        set(patch: Record<string, unknown>) {
          return {
            where() {
              updated.push(patch);
              return Promise.resolve();
            },
          };
        },
      };
    },
  } as unknown as Db;

  return { db, inserted, updated };
}

const ARGS = {
  tenantId: "00000000-0000-0000-0000-00000000000a",
  sessionId: "44444444-4444-4444-8444-44444444a001",
  userId: "22222222-2222-4222-8222-2222222222a1",
};

beforeEach(() => {
  complete.mockReset();
  complete.mockResolvedValue("Atlas asks a concrete question.");
  extractFromTurn.mockReset();
  // Default: no captures, so the message-only assertions below stay exact.
  extractFromTurn.mockResolvedValue([]);
});

describe("openSession", () => {
  it("emits the INTRO opener and persists only the assistant turn", async () => {
    const { db, inserted, updated } = makeDb([]);
    const res = await openSession({ db, ...ARGS });

    expect(res.arc).toBe("INTRO");
    expect(res.done).toBe(false);
    expect(res.assistant).toBe("Atlas asks a concrete question.");

    // One insert batch, one row, role=assistant, arc=INTRO.
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toHaveLength(1);
    expect(inserted[0][0]).toMatchObject({
      role: "assistant",
      arc: "INTRO",
      userId: ARGS.userId,
      sessionId: ARGS.sessionId,
      tenantId: ARGS.tenantId,
    });
    expect(updated).toHaveLength(1);
  });

  it("builds a system prompt that carries the topic", async () => {
    const { db } = makeDb([]);
    await openSession({ db, ...ARGS });
    const call = complete.mock.calls[0][0] as { system: string };
    expect(call.system).toContain("Quote-to-cash handoffs");
  });
});

describe("takeTurn", () => {
  it("records the user message AND the assistant reply (2 rows) and bumps count", async () => {
    // History: the opener (INTRO assistant). First real user turn → ARC_1.
    const { db, inserted, updated } = makeDb([
      { role: "assistant", content: "Opening question.", arc: "INTRO" },
    ]);
    const res = await takeTurn({
      db,
      ...ARGS,
      userMessage: "Here is how the workflow goes.",
    });

    expect(res.arc).toBe("ARC_1");
    expect(res.done).toBe(false);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toHaveLength(2);
    expect(inserted[0][0]).toMatchObject({ role: "user", arc: "ARC_1" });
    expect(inserted[0][1]).toMatchObject({ role: "assistant", arc: "ARC_1" });
    expect(updated).toHaveLength(1);
  });

  it("passes the full prior transcript plus the new user turn to the model", async () => {
    const { db } = makeDb([
      { role: "assistant", content: "Opening question.", arc: "INTRO" },
      { role: "user", content: "First answer.", arc: "ARC_1" },
      { role: "assistant", content: "A probe.", arc: "ARC_1" },
    ]);
    await takeTurn({ db, ...ARGS, userMessage: "Second answer." });
    const call = complete.mock.calls[0][0] as {
      messages: { role: string; content: string }[];
    };
    expect(call.messages).toEqual([
      { role: "assistant", content: "Opening question." },
      { role: "user", content: "First answer." },
      { role: "assistant", content: "A probe." },
      { role: "user", content: "Second answer." },
    ]);
  });

  it("advances ARC_1 → ARC_2 once the arc's turn budget is spent", async () => {
    // 3 user turns already in ARC_1 (budget = 3) → next assistant turn is ARC_2.
    const { db } = makeDb([
      { role: "assistant", content: "q0", arc: "INTRO" },
      { role: "user", content: "a1", arc: "ARC_1" },
      { role: "assistant", content: "q1", arc: "ARC_1" },
      { role: "user", content: "a2", arc: "ARC_1" },
      { role: "assistant", content: "q2", arc: "ARC_1" },
      { role: "user", content: "a3", arc: "ARC_1" },
      { role: "assistant", content: "q3", arc: "ARC_1" },
    ]);
    const res = await takeTurn({ db, ...ARGS, userMessage: "a4" });
    expect(res.arc).toBe("ARC_2");
  });

  it("inserts extracted captures in the same call, bumps captureCount, and returns them", async () => {
    extractFromTurn.mockResolvedValue([
      {
        kind: "bottleneck",
        summary: "Re-keys the quote by hand.",
        sourceQuote: "I re-key the quote by hand",
        tags: [],
      },
      {
        kind: "tooling",
        summary: "Uses a spreadsheet to track it.",
        sourceQuote: "in a spreadsheet",
        tags: ["spreadsheet"],
      },
    ]);

    const { db, inserted, updated } = makeDb([
      { role: "assistant", content: "Opening question.", arc: "INTRO" },
    ]);
    const res = await takeTurn({
      db,
      ...ARGS,
      userMessage: "I re-key the quote by hand in a spreadsheet.",
    });

    // Two insert batches now: the two message turns, then the two captures.
    expect(inserted).toHaveLength(2);
    expect(inserted[1]).toHaveLength(2);
    expect(inserted[1][0]).toMatchObject({
      kind: "bottleneck",
      sessionId: ARGS.sessionId,
      tenantId: ARGS.tenantId,
      userId: ARGS.userId,
    });

    // Result carries {id, kind, summary} for plan 015.
    expect(res.captures).toEqual([
      { id: "cap-0", kind: "bottleneck", summary: "Re-keys the quote by hand." },
      { id: "cap-1", kind: "tooling", summary: "Uses a spreadsheet to track it." },
    ]);

    // captureCount bumped (the second update; first is messages_count).
    expect(updated).toHaveLength(2);
    expect("captureCount" in updated[1]).toBe(true);
  });

  it("does not fail the turn when extraction throws LlmOutputError", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    extractFromTurn.mockRejectedValue(new LlmOutputError("bad json"));

    const { db, inserted, updated } = makeDb([
      { role: "assistant", content: "Opening question.", arc: "INTRO" },
    ]);
    const res = await takeTurn({ db, ...ARGS, userMessage: "An answer." });

    // Turn still succeeded; messages persisted; no capture insert/update.
    expect(res.assistant).toBe("Atlas asks a concrete question.");
    expect(res.captures).toEqual([]);
    expect(inserted).toHaveLength(1); // only the message batch
    expect(updated).toHaveLength(1); // only messages_count
    // A warning was logged, but with no capture content.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("An answer");
    warn.mockRestore();
  });

  it("does not leak transcript content to the console", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const { db } = makeDb([
      { role: "assistant", content: "Opening question.", arc: "INTRO" },
    ]);
    await takeTurn({ db, ...ARGS, userMessage: "secret content" });
    for (const call of [...spy.mock.calls, ...infoSpy.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain("secret content");
    }
    spy.mockRestore();
    infoSpy.mockRestore();
  });
});
