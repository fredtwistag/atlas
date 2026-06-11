import { z } from "zod";

/**
 * Zod schemas for structured LLM outputs. CLAUDE.md: "Zod schemas for every API
 * input AND every LLM output (validate before use)." `completeStructured` in
 * ./client.ts runs the model's JSON through one of these before any caller sees
 * it.
 *
 * The capture schema mirrors docs/03-conversational-engine.md §6. Plan 014 owns
 * the extraction pass that produces these; it lives here so the LLM layer has a
 * single home for output contracts and 014 imports rather than redefining.
 */
export const CaptureSchema = z.object({
  kind: z.enum([
    "bottleneck",
    "workaround",
    "tooling",
    "handoff",
    "frustration",
    "sop",
    "decision",
  ]),
  summary: z.string().min(15).max(280),
  source_quote: z.string(),
  tags: z.array(z.string()).max(5),
  confidence: z.number().min(0).max(1),
});

export type Capture = z.infer<typeof CaptureSchema>;

/**
 * The extraction pass returns zero or more captures for a single user turn.
 * Wrapped in an object so the model returns a JSON object (more reliable than a
 * bare top-level array across models).
 */
export const ExtractionResultSchema = z.object({
  captures: z.array(CaptureSchema),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
