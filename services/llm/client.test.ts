import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";

// One mock create() the whole suite drives. vi.hoisted lets the (hoisted)
// vi.mock factory and the test body share the same spy. The mocked default
// export is a constructor whose instance exposes that spy at messages.create.
const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

import {
  complete,
  completeStructured,
  completeWithWebSearch,
  llmErrorReason,
  LlmNotConfiguredError,
  LlmOutputError,
} from "./client";

function textMessage(text: string) {
  return { content: [{ type: "text", text }] };
}

const OLD_ENV = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  create.mockReset();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

afterEach(() => {
  if (OLD_ENV === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = OLD_ENV;
});

describe("complete", () => {
  it("returns the model's concatenated text", async () => {
    create.mockResolvedValueOnce(textMessage("hello from atlas"));
    const out = await complete({
      system: "sys",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(out).toBe("hello from atlas");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("throws LlmNotConfiguredError with no API key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      complete({ system: "s", messages: [{ role: "user", content: "x" }] }),
    ).rejects.toBeInstanceOf(LlmNotConfiguredError);
    expect(create).not.toHaveBeenCalled();
  });
});

const Shape = z.object({ ok: z.boolean(), n: z.number() });

describe("completeStructured", () => {
  it("parses valid JSON output", async () => {
    create.mockResolvedValueOnce(textMessage('{"ok":true,"n":3}'));
    const out = await completeStructured({
      system: "s",
      messages: [{ role: "user", content: "x" }],
      schema: Shape,
    });
    expect(out).toEqual({ ok: true, n: 3 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("strips markdown fences before parsing", async () => {
    create.mockResolvedValueOnce(
      textMessage('```json\n{"ok":false,"n":0}\n```'),
    );
    const out = await completeStructured({
      system: "s",
      messages: [{ role: "user", content: "x" }],
      schema: Shape,
    });
    expect(out).toEqual({ ok: false, n: 0 });
  });

  it("retries ONCE on a schema-rejection then succeeds", async () => {
    // First reply violates the schema (n is a string); retry returns valid JSON.
    create
      .mockResolvedValueOnce(textMessage('{"ok":true,"n":"nope"}'))
      .mockResolvedValueOnce(textMessage('{"ok":true,"n":7}'));
    const out = await completeStructured({
      system: "s",
      messages: [{ role: "user", content: "x" }],
      schema: Shape,
    });
    expect(out).toEqual({ ok: true, n: 7 });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("throws LlmOutputError after the retry also fails schema validation", async () => {
    create
      .mockResolvedValueOnce(textMessage('{"ok":"x","n":"y"}'))
      .mockResolvedValueOnce(textMessage('{"ok":"still","n":"bad"}'));
    await expect(
      completeStructured({
        system: "s",
        messages: [{ role: "user", content: "x" }],
        schema: Shape,
      }),
    ).rejects.toBeInstanceOf(LlmOutputError);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("retries ONCE on invalid JSON then throws LlmOutputError if still unparseable", async () => {
    create
      .mockResolvedValueOnce(textMessage("not json at all"))
      .mockResolvedValueOnce(textMessage("still not json"));
    await expect(
      completeStructured({
        system: "s",
        messages: [{ role: "user", content: "x" }],
        schema: Shape,
      }),
    ).rejects.toBeInstanceOf(LlmOutputError);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("throws LlmNotConfiguredError with no API key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      completeStructured({
        system: "s",
        messages: [{ role: "user", content: "x" }],
        schema: Shape,
      }),
    ).rejects.toBeInstanceOf(LlmNotConfiguredError);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("llmErrorReason", () => {
  it("maps a missing-key error to 'not_configured'", () => {
    expect(llmErrorReason(new LlmNotConfiguredError())).toBe("not_configured");
  });

  it("maps an output/validation error to 'failed'", () => {
    expect(llmErrorReason(new LlmOutputError("bad shape"))).toBe("failed");
  });

  it("maps any other error to 'failed'", () => {
    expect(llmErrorReason(new Error("network"))).toBe("failed");
    expect(llmErrorReason("not even an error")).toBe("failed");
  });
});

describe("completeWithWebSearch", () => {
  it("parses valid JSON output in one attempt", async () => {
    create.mockResolvedValueOnce(textMessage('{"ok":true,"n":2}'));
    const out = await completeWithWebSearch({
      system: "s",
      messages: [{ role: "user", content: "x" }],
      schema: Shape,
    });
    expect(out).toEqual({ ok: true, n: 2 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("retries ONCE on a schema-rejection then succeeds", async () => {
    create
      .mockResolvedValueOnce(textMessage('{"ok":true,"n":"nope"}'))
      .mockResolvedValueOnce(textMessage('{"ok":true,"n":9}'));
    const out = await completeWithWebSearch({
      system: "s",
      messages: [{ role: "user", content: "x" }],
      schema: Shape,
    });
    expect(out).toEqual({ ok: true, n: 9 });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("throws LlmOutputError after the retry also fails validation", async () => {
    create
      .mockResolvedValueOnce(textMessage('{"ok":"x","n":"y"}'))
      .mockResolvedValueOnce(textMessage('{"ok":"still","n":"bad"}'));
    await expect(
      completeWithWebSearch({
        system: "s",
        messages: [{ role: "user", content: "x" }],
        schema: Shape,
      }),
    ).rejects.toBeInstanceOf(LlmOutputError);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("throws LlmNotConfiguredError with no API key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      completeWithWebSearch({
        system: "s",
        messages: [{ role: "user", content: "x" }],
        schema: Shape,
      }),
    ).rejects.toBeInstanceOf(LlmNotConfiguredError);
    expect(create).not.toHaveBeenCalled();
  });
});
