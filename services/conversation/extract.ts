import { readFileSync } from "node:fs";
import { join } from "node:path";
import { completeStructured } from "@/services/llm/client";
import { captureExtraction, type CapturedItem } from "@/services/llm/schemas";

/**
 * Capture extraction (plan 014): turn raw user turns into Zod-validated captures.
 *
 * Two entry points:
 * - `extractFromTurn` — runs after every user turn (docs/03 §1 "extract
 *   continuously"). Small input, ≤4 captures.
 * - `extractFromSession` — the completion sweep over the whole transcript that
 *   catches what per-turn passes missed. Callable standalone so plan 020 can
 *   move it into an Inngest job without touching this module.
 *
 * Quality gate: the model is told to copy the user's verbatim words into
 * `sourceQuote`, but it sometimes paraphrases. We DROP any item whose
 * `sourceQuote` is not a literal substring of the user text it claims to quote —
 * we never throw on it, because a single hallucinated quote must not cost us the
 * real captures in the same batch. Empty result is always valid; small talk
 * produces nothing.
 *
 * Privacy (CLAUDE.md): this module NEVER logs capture content or quotes. The
 * only thing callers may log is a count.
 */

const RUBRIC = readFileSync(
  join(process.cwd(), "prompts", "discovery-rubric.md"),
  "utf8",
);

/** Capture-kind taxonomy, inlined into the prompt so the model knows the enum. */
const KIND_GUIDE = [
  "bottleneck — where the process slows down",
  "workaround — an unofficial fix for a broken process",
  "tooling — a reference to a tool/system, good or bad",
  "handoff — coordination between roles or systems",
  "frustration — a pain point without an obvious workaround",
  "sop — a standard operating procedure being described",
  "decision — a decision or approval gate",
].join("\n");

function extractionSystem(): string {
  return [
    "You extract structured captures from a discovery interview. You are NOT",
    "the interviewer — you only read what was said and record concrete signals.",
    "",
    "A capture is one concrete operational fact the contributor stated: a",
    "bottleneck, a workaround, a tool, a handoff, a frustration, an SOP, or a",
    "decision gate. Use ONLY these kinds:",
    KIND_GUIDE,
    "",
    "RULES:",
    "1. Extract ONLY from the contributor's own words. Never invent facts.",
    "2. `summary` is a short, neutral restatement in active voice (no names).",
    "3. `sourceQuote` MUST be copied verbatim from the contributor's message —",
    "   the exact characters, not a paraphrase. If you cannot quote it word for",
    "   word, do not include the capture.",
    "4. Small talk, greetings, and meta-chatter produce NO captures. An empty",
    "   list is the correct answer when nothing concrete was said.",
    "5. At most 4 captures per pass. Prefer the few highest-signal ones.",
    "6. `tags` are 0–5 short lowercase labels (e.g. 'margin risk', 'cross-team').",
    "7. `quantifiedImpact`: ONLY when the contributor gave numbers, fill what",
    "   they stated — frequencyPerYear (convert 'twice a week' → ~104),",
    "   unitMinutes (time per occurrence), unitCostUsd (a direct dollar cost if",
    "   named), and a short `basis` quoting their words. Leave a field null if",
    "   not stated; set the whole object to null when no numbers were given.",
    "   NEVER invent or estimate numbers the contributor did not say.",
    "",
    "=== DISCOVERY RUBRIC (context for what matters) ===",
    RUBRIC,
  ].join("\n");
}

/**
 * Keep only captures whose `sourceQuote` literally appears in `userText`. The
 * comparison is whitespace-normalized + case-insensitive so trivial reflow
 * (the model collapsing a newline to a space) doesn't drop a real quote, but a
 * fabricated quote still fails.
 */
function dropFabricatedQuotes(
  items: CapturedItem[],
  userText: string,
): CapturedItem[] {
  const haystack = normalize(userText);
  return items.filter((item) => haystack.includes(normalize(item.sourceQuote)));
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export type ExtractFromTurnOpts = {
  topicTitle: string;
  arc: string;
  userMessage: string;
  priorAssistant: string | null;
};

/**
 * Extract captures from a single user turn. The prior assistant message is
 * passed as context (it framed the question) but quotes must come from the
 * user. Returns [] on small talk. Throws `LlmOutputError` only if the model
 * output can't be coerced at all — the caller catches that and continues.
 */
export async function extractFromTurn(
  opts: ExtractFromTurnOpts,
): Promise<CapturedItem[]> {
  const context = [
    `TOPIC: ${opts.topicTitle}`,
    `CURRENT ARC: ${opts.arc}`,
    opts.priorAssistant
      ? `ATLAS JUST ASKED: ${opts.priorAssistant}`
      : "ATLAS JUST OPENED THE SESSION.",
    "",
    "CONTRIBUTOR SAID:",
    opts.userMessage,
  ].join("\n");

  const { captures } = await completeStructured({
    system: extractionSystem(),
    schema: captureExtraction,
    messages: [{ role: "user", content: context }],
  });

  return dropFabricatedQuotes(captures, opts.userMessage);
}

export type SessionTurn = { role: string; content: string };

export type ExtractFromSessionOpts = {
  topicTitle: string;
  turns: SessionTurn[];
};

/**
 * Whole-transcript extraction sweep for session completion. Concatenates the
 * contributor's turns into one corpus and extracts against it; the substring
 * guard runs against that same corpus so cross-turn quotes still validate.
 * Returns [] when there is nothing the user said worth capturing.
 */
export async function extractFromSession(
  opts: ExtractFromSessionOpts,
): Promise<CapturedItem[]> {
  const userText = opts.turns
    .filter((t) => t.role === "user")
    .map((t) => t.content)
    .join("\n\n");
  if (normalize(userText).length === 0) return [];

  const transcript = opts.turns
    .map((t) => `${t.role === "user" ? "CONTRIBUTOR" : "ATLAS"}: ${t.content}`)
    .join("\n");

  const context = [
    `TOPIC: ${opts.topicTitle}`,
    "",
    "Below is the full interview transcript. Extract the highest-signal",
    "captures the contributor stated across the whole conversation. Quotes must",
    "still come verbatim from the contributor's lines.",
    "",
    "=== TRANSCRIPT ===",
    transcript,
  ].join("\n");

  const { captures } = await completeStructured({
    system: extractionSystem(),
    schema: captureExtraction,
    messages: [{ role: "user", content: context }],
  });

  return dropFabricatedQuotes(captures, userText);
}
