import { ARCS, type Arc } from "@/services/conversation/state";

/**
 * Honest, monotonic progress for the IC conversation rail.
 *
 * The engine does not hand the UI a "percent complete" — it advances through
 * arcs (INTRO → ARC_1..4 → CLOSE → DONE) and only signals `done` at the end.
 * We map the furthest arc seen to a coarse percentage so the bar moves with the
 * real conversation rather than a fake timer. We never reach 100% until the
 * session is actually done, so the bar can't over-promise.
 *
 * INIT (no turns yet) reads as 0; CLOSE sits at 90 so "done" is a visible jump.
 */
const ARC_PERCENT: Record<Arc, number> = {
  INIT: 0,
  INTRO: 5,
  ARC_1: 20,
  ARC_2: 40,
  ARC_3: 60,
  ARC_4: 80,
  CLOSE: 90,
  DONE: 100,
};

function isArc(value: string): value is Arc {
  return (ARCS as readonly string[]).includes(value);
}

/** The furthest-along arc among a set of message arcs (unknown values ignored). */
export function furthestArc(arcs: readonly (string | null)[]): Arc {
  let best: Arc = "INIT";
  for (const a of arcs) {
    if (a && isArc(a) && ARC_PERCENT[a] > ARC_PERCENT[best]) best = a;
  }
  return best;
}

/**
 * Progress percent (0-100) for a conversation. `done` short-circuits to 100 so
 * the completion state always reads as finished even if the last message's arc
 * lagged (CLOSE).
 */
export function progressForArc(arc: Arc, done: boolean): number {
  if (done) return 100;
  return ARC_PERCENT[arc];
}
