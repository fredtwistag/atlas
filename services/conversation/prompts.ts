import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arcIndex, arcName, isDone, type Arc } from "./state";

/**
 * Builds the system prompt for a single conversation turn by composing the
 * prompt corpus in prompts/ (the IP — see docs/03-conversational-engine.md) with
 * the live session context: role, user, topic, and current arc.
 *
 * Server-only. The markdown is read once at module init via process.cwd(),
 * which Next resolves to the project root for route handlers (verified by the
 * integration smoke in plan 013 Step 6). Do NOT import this into client code.
 */

export type ConversationRole = "ic" | "manager" | "sponsor";

function load(...segments: string[]): string {
  return readFileSync(join(process.cwd(), "prompts", ...segments), "utf8");
}

// Read the corpus once. A bad path throws here, at import — loud and early.
const DISCOVERY_RUBRIC = load("discovery-rubric.md");
const PROBE_PATTERNS = load("probe-patterns.md");
const ROLE_PROMPTS: Record<ConversationRole, string> = {
  ic: load("role-prompts", "ic-role-prompts.md"),
  manager: load("role-prompts", "manager-role-prompts.md"),
  // The sponsor arc maps to the CEO/Sponsor corpus (docs/03 §4).
  sponsor: load("role-prompts", "ceo-sponsor-role-prompts.md"),
};

export type BuildSystemPromptOpts = {
  role: ConversationRole;
  userName: string;
  department: string | null;
  topicTitle: string;
  topicDescription?: string | null;
  arc: Arc;
};

/** Arc-specific instruction appended to the system prompt (docs/03 §2, §3). */
function arcInstruction(arc: Arc): string {
  switch (arc) {
    case "INIT":
    case "INTRO":
      return [
        "You are opening the session. Greet the contributor by first name in one",
        "short sentence, name the topic, and ask your FIRST workflow-walkthrough",
        "question (Arc 1). One question only. No preamble about what Atlas is.",
      ].join(" ");
    case "ARC_1":
      return [
        "ARC 1 — Workflow walkthrough. Map how the work actually happens, step by",
        "step. Anchor: walk me through what happens from the trigger event to the",
        "outcome. Probe for missing steps and hidden actors. Max 2 probes.",
      ].join(" ");
    case "ARC_2":
      return [
        "ARC 2 — Frustration mining. Find where it slows down or hurts. Anchor:",
        "where does this get frustrating in practice? Probe to quantify (how",
        "often, how much time/money) and for a concrete recent instance. Max 2 probes.",
      ].join(" ");
    case "ARC_3":
      return [
        "ARC 3 — Edge cases & exceptions. What happens when the standard process",
        "doesn't apply? Probe for the workaround used and the tribal knowledge",
        "(who knows what, is it documented). Max 2 probes.",
      ].join(" ");
    case "ARC_4":
      return [
        "ARC 4 — Tools & constraints. What's in the toolkit and what's missing?",
        "Anchor: which tools do you use most, which do you fight with? Probe with a",
        "counterfactual (if X went away) and for missing connections between",
        "systems. Max 2 probes.",
      ].join(" ");
    case "CLOSE":
      return [
        "Closing. Thank the contributor by first name, note that what they shared",
        "is captured and reviewable in their dashboard for the next 7 days, and end",
        "warmly in two sentences. Do NOT ask another question.",
      ].join(" ");
    case "DONE":
      return "The session is complete. Do not produce further questions.";
  }
}

/**
 * Compose the full system prompt for the given turn. Mirrors the master prompt
 * in docs/03 §3: identity, user/role framing, current topic, current arc, and
 * the standing rules — plus the role corpus and probe library.
 */
export function buildSystemPrompt(opts: BuildSystemPromptOpts): string {
  const idx = arcIndex(opts.arc);
  const arcLabel =
    idx === null
      ? arcName(opts.arc)
      : `ARC ${idx} of 4: ${arcName(opts.arc)}`;
  const dept = opts.department ?? "their";

  return [
    "You are Atlas, a discovery copilot helping a client team understand how",
    "work actually happens across its teams.",
    "",
    `You are running a conversational interview with ${opts.userName}, who works`,
    `in the ${dept} department.`,
    "",
    `CURRENT TOPIC: ${opts.topicTitle}`,
    opts.topicDescription ? opts.topicDescription : "",
    "",
    `You are currently in ${arcLabel}.`,
    arcInstruction(opts.arc),
    "",
    "STANDING RULES:",
    "1. Ask ONE question at a time. Open-ended. Concrete.",
    "2. If their answer is vague, probe ONCE for specifics (names, numbers,",
    "   frequency, time impact). Max 2 probes per arc.",
    "3. If they give a clear, complete answer, advance — do not pad with probes.",
    "4. If they want to skip, accept it without pushing.",
    "5. Never lecture. Never recommend solutions during the conversation.",
    "6. Brief acknowledgements only — do not parrot their answer back at length.",
    "7. Refer to specific people only by role, never invent names. If the user",
    "   names someone, you may use that name to follow up.",
    "8. Tone: peer to peer. Short sentences. Conversational, not corporate.",
    "9. Your output is ONLY the single message to the user — no JSON, no commentary.",
    "",
    "=== ROLE GUIDANCE ===",
    ROLE_PROMPTS[opts.role],
    "",
    "=== DISCOVERY RUBRIC ===",
    DISCOVERY_RUBRIC,
    "",
    "=== PROBE PATTERNS ===",
    PROBE_PATTERNS,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** Re-exported so callers building prompts don't need a second import for the guard. */
export { isDone };
