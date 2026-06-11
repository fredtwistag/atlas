import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

/**
 * The single LLM access path for Atlas. CLAUDE.md: everything LLM-shaped is
 * "abstracted through services/llm/". Callers never construct an Anthropic
 * client, never reference the model id, and never parse raw model JSON — they
 * go through `complete` (free text) or `completeStructured` (Zod-validated).
 *
 * Server-only. The Anthropic SDK reads `ANTHROPIC_API_KEY`; we surface a typed
 * error when it is absent so callers can decide a fallback rather than silently
 * no-op.
 *
 * Cost controls (model pin, max tokens) live HERE and nowhere else — plan 016's
 * opportunity engine and the SOW upgrade both call `completeStructured`.
 */

/** The model id is configured in exactly one place. */
function modelId(): string {
  return process.env.ATLAS_LLM_MODEL ?? "claude-sonnet-4-6";
}

const DEFAULT_MAX_TOKENS = 1024;

/** Thrown when no ANTHROPIC_API_KEY is configured. Callers decide the fallback. */
export class LlmNotConfiguredError extends Error {
  constructor() {
    super(
      "Conversation engine not configured — set ANTHROPIC_API_KEY in the environment.",
    );
    this.name = "LlmNotConfiguredError";
  }
}

/** Thrown when the model's output cannot be coerced to the requested schema, after one retry. */
export class LlmOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmOutputError";
  }
}

export type LlmMessage = { role: "user" | "assistant"; content: string };

export type CompleteOpts = {
  system: string;
  messages: LlmMessage[];
  maxTokens?: number;
};

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new LlmNotConfiguredError();
  return new Anthropic({ apiKey });
}

/** Concatenate the text blocks of a message response into a single string. */
function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/** A single free-text completion. Returns the assistant's text. */
export async function complete(opts: CompleteOpts): Promise<string> {
  const anthropic = client();
  const message = await anthropic.messages.create({
    model: modelId(),
    max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: opts.system,
    messages: opts.messages,
  });
  return textOf(message);
}

/** Pull the first balanced JSON object/array out of a model reply (it may wrap JSON in prose or fences). */
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : raw).trim();
  const start = body.search(/[[{]/);
  if (start === -1) return body;
  const open = body[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  for (let i = start; i < body.length; i++) {
    if (body[i] === open) depth++;
    else if (body[i] === close) {
      depth--;
      if (depth === 0) return body.slice(start, i + 1);
    }
  }
  return body.slice(start);
}

/**
 * A completion whose output is parsed through `schema`. On a parse/validation
 * failure it retries ONCE with the validation error appended, then throws
 * `LlmOutputError`. The model is instructed to emit JSON only.
 */
export async function completeStructured<T>(
  opts: CompleteOpts & { schema: z.ZodType<T> },
): Promise<T> {
  const anthropic = client();
  const jsonSystem = `${opts.system}\n\nRespond with valid JSON only. No prose, no markdown fences.`;
  const messages: LlmMessage[] = [...opts.messages];

  for (let attempt = 0; attempt < 2; attempt++) {
    const message = await anthropic.messages.create({
      model: modelId(),
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: jsonSystem,
      messages,
    });
    const raw = textOf(message);

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(extractJson(raw));
    } catch (err) {
      const reason = err instanceof Error ? err.message : "invalid JSON";
      if (attempt === 1) {
        throw new LlmOutputError(`Model output was not valid JSON: ${reason}`);
      }
      messages.push({ role: "assistant", content: raw });
      messages.push({
        role: "user",
        content: `That was not valid JSON (${reason}). Reply with valid JSON only.`,
      });
      continue;
    }

    const result = opts.schema.safeParse(parsedJson);
    if (result.success) return result.data;

    if (attempt === 1) {
      throw new LlmOutputError(
        `Model output failed schema validation: ${result.error.message}`,
      );
    }
    messages.push({ role: "assistant", content: raw });
    messages.push({
      role: "user",
      content: `That JSON failed validation: ${result.error.message}. Fix it and reply with valid JSON only.`,
    });
  }

  // Unreachable: the loop either returns or throws on attempt 1.
  throw new LlmOutputError("Structured completion exhausted its retry.");
}
