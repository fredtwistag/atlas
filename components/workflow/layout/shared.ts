import type { WorkflowStep } from "@/services/llm/schemas";
import type { LayoutBox, Tone } from "./types";

/**
 * Left-to-right column index per step id, respecting edge direction. Starts
 * every step at column 0 and relaxes: a target sits ≥1 column right of its
 * source. Capped at `stepIds.length` passes so a cycle terminates.
 */
export function assignColumns(
  stepIds: string[],
  edges: { from: string; to: string }[],
): Map<string, number> {
  const col = new Map<string, number>();
  for (const id of stepIds) col.set(id, 0);
  for (let pass = 0; pass < stepIds.length; pass++) {
    let changed = false;
    for (const e of edges) {
      if (!col.has(e.from) || !col.has(e.to)) continue;
      const want = (col.get(e.from) as number) + 1;
      if ((col.get(e.to) as number) < want) {
        col.set(e.to, want);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return col;
}

export function stepTone(step: WorkflowStep): Tone {
  if (step.inferred) return "gray";
  switch (step.stepKind) {
    case "bottleneck":
    case "gap":
      return "red";
    case "shadow_tool":
      return "amber";
    case "start":
    case "end":
      return "gray";
    default:
      return "blue";
  }
}

export function stepShape(step: WorkflowStep): "rect" | "diamond" | "circle" {
  return step.stepKind === "decision" ? "diamond" : "rect";
}

/** Orthogonal connector from a's right edge to b's left edge; L-bend across rows. */
export function routeEdge(a: LayoutBox, b: LayoutBox): { x: number; y: number }[] {
  const start = { x: a.x + a.w, y: a.y + a.h / 2 };
  const end = { x: b.x - 8, y: b.y + b.h / 2 };
  if (Math.abs(start.y - end.y) < 1) return [start, end];
  const midX = (start.x + b.x) / 2;
  return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
}

/**
 * Greedy word-wrap into at most `maxLines` lines of ~`maxChars` each. If text
 * remains after the last line it is ellipsized. Used to fit a card's evidence
 * description across up to two lines instead of truncating it to one.
 */
export function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars || !cur) {
      cur = next;
    } else {
      lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);

  // Ellipsize the last line if not every word made it in.
  const consumed = lines.join(" ").replace(/\s+/g, " ").trim();
  const full = words.join(" ");
  if (consumed.length < full.length && lines.length > 0) {
    const last = lines[lines.length - 1];
    const cut = last.length > maxChars - 1 ? last.slice(0, maxChars - 1) : last;
    lines[lines.length - 1] = `${cut.replace(/[\s.,;:]+$/, "")}…`;
  }
  return lines.slice(0, maxLines);
}
