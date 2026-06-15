/**
 * The conversation arc state machine. Pure functions, no I/O.
 *
 * Arcs (docs/03-conversational-engine.md §2, prompts/discovery-rubric.md):
 *   INIT  → no turns yet; the engine emits the INTRO message.
 *   INTRO → greeting + framing; first user reply moves into ARC_1.
 *   ARC_1 Workflow walkthrough
 *   ARC_2 Frustration mining
 *   ARC_3 Edge cases & exceptions
 *   ARC_4 Tools & constraints
 *   CLOSE → the wrap-up / closing message.
 *   DONE  → session complete; no further turns.
 *
 * Turn budget — from prompts/discovery-rubric.md "4 arcs × (1 anchor + up to 2
 * probes)" and docs/03 "Maximum 2 follow-ups per arc". Each arc therefore spans
 * at most 3 user turns (1 anchor answer + up to 2 probe answers). The session
 * targets ~5-8 user turns total across the 4 arcs (docs/03 §10: "~10 turns per
 * session" counting both speakers; §1 "4-6 minutes"). We advance when the
 * arc's turn budget is spent; the model is also free to advance earlier (a
 * complete answer needs no probes — the rubric's "advance without probing"),
 * which is handled in the prompt, not here.
 */

export const ARCS = [
  "INIT",
  "INTRO",
  "ARC_1",
  "ARC_2",
  "ARC_3",
  "ARC_4",
  "CLOSE",
  "DONE",
] as const;

export type Arc = (typeof ARCS)[number];

/** Max user turns spent in an arc before we force-advance to the next. */
export const MAX_TURNS_PER_ARC = 3;

/**
 * Probe budget per arc (docs/03 §3 "out of 2"): an arc is 1 anchor + up to 2
 * probes. The anchor is the first user turn; every later turn spends a probe.
 */
export const MAX_PROBES_PER_ARC = 2;

/**
 * Probes still available for the NEXT question in an arc, given how many user
 * turns have already been spent in it. Surfaced in the system prompt so the
 * model self-limits (docs/03 §3 PROBE BUDGET line). The anchor (turnsInArc 0–1)
 * has not spent a probe; each subsequent turn has.
 */
export function probesRemaining(turnsInArc: number): number {
  const used = Math.max(0, turnsInArc - 1);
  return Math.max(0, MAX_PROBES_PER_ARC - used);
}

/** 1-based index of an interview arc (1..4), for the system prompt. INTRO/CLOSE/etc. have no number. */
export function arcIndex(arc: Arc): number | null {
  switch (arc) {
    case "ARC_1":
      return 1;
    case "ARC_2":
      return 2;
    case "ARC_3":
      return 3;
    case "ARC_4":
      return 4;
    case "INIT":
    case "INTRO":
    case "CLOSE":
    case "DONE":
      return null;
  }
}

/** True once the session is complete and no further turns should be taken. */
export function isDone(arc: Arc): boolean {
  switch (arc) {
    case "DONE":
      return true;
    case "INIT":
    case "INTRO":
    case "ARC_1":
    case "ARC_2":
    case "ARC_3":
    case "ARC_4":
    case "CLOSE":
      return false;
  }
}

/**
 * Given the current arc and how many user turns have been spent in it, return
 * the arc to run for the next assistant message. INIT always yields INTRO (the
 * opener). An interview arc advances once its turn budget (MAX_TURNS_PER_ARC)
 * is reached. CLOSE → DONE. DONE is terminal.
 *
 * Exhaustive switch, no `default:` — adding an Arc without handling it is a
 * compile error (CLAUDE.md state-machine discipline).
 */
export function nextArc(current: Arc, turnsInArc: number): Arc {
  switch (current) {
    case "INIT":
      return "INTRO";
    case "INTRO":
      return "ARC_1";
    case "ARC_1":
      return turnsInArc >= MAX_TURNS_PER_ARC ? "ARC_2" : "ARC_1";
    case "ARC_2":
      return turnsInArc >= MAX_TURNS_PER_ARC ? "ARC_3" : "ARC_2";
    case "ARC_3":
      return turnsInArc >= MAX_TURNS_PER_ARC ? "ARC_4" : "ARC_3";
    case "ARC_4":
      return turnsInArc >= MAX_TURNS_PER_ARC ? "CLOSE" : "ARC_4";
    case "CLOSE":
      return "DONE";
    case "DONE":
      return "DONE";
  }
}

/** Human-readable name of an arc, for prompts and logs (never logs content). */
export function arcName(arc: Arc): string {
  switch (arc) {
    case "INIT":
      return "Initialization";
    case "INTRO":
      return "Introduction";
    case "ARC_1":
      return "Workflow walkthrough";
    case "ARC_2":
      return "Frustration mining";
    case "ARC_3":
      return "Edge cases & exceptions";
    case "ARC_4":
      return "Tools & constraints";
    case "CLOSE":
      return "Closing";
    case "DONE":
      return "Complete";
  }
}
