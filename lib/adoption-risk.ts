import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { opportunities, captures, sessions, users } from "@/db/schema";
import type { DimensionScore } from "./types";

/**
 * Adoption-risk heatmap (Ticket E). Operationalizes risk R1 (docs/08): name
 * where deployment resistance lives, by department, BEFORE the FDE engagement.
 *
 * Computed on read (no new table). Two signals per department:
 * - avgChangeMgmtScore: mean `change_mgmt` dimension score across that
 *   department's opportunities. Higher score = lower change cost, so a LOW
 *   average means high resistance.
 * - resistanceSignalCount: workarounds + SOPs + tribal-knowledge captures in
 *   that department — a team that has worked around process for years resists
 *   change.
 *
 * Privacy (CLAUDE.md): role/department only. No individual name is ever read or
 * returned — the capture query selects department + kind + tags, never a name.
 */

export type AdoptionRiskLevel = "low" | "medium" | "high";

export interface AdoptionRiskRow {
  department: string;
  avgChangeMgmtScore: number; // 0–10, one decimal
  oppCount: number;
  resistanceSignalCount: number;
  level: AdoptionRiskLevel;
}

/** Capture kinds that signal entrenched, change-resistant ways of working. */
const RESISTANCE_KINDS = new Set(["workaround", "sop"]);

/**
 * Derive the resistance band (pure, unit-tested). Low change-mgmt score OR many
 * resistance signals → high; the milder of either → medium; otherwise low.
 */
export function adoptionLevel(
  avgChangeMgmtScore: number,
  resistanceSignalCount: number,
): AdoptionRiskLevel {
  if (avgChangeMgmtScore <= 4 || resistanceSignalCount >= 4) return "high";
  if (avgChangeMgmtScore <= 6 || resistanceSignalCount >= 2) return "medium";
  return "low";
}

function changeMgmtScore(dimensionScores: unknown): number | null {
  if (!Array.isArray(dimensionScores)) return null;
  const d = (dimensionScores as DimensionScore[]).find(
    (x) => x.key === "change_mgmt",
  );
  return d ? d.score : null;
}

/** Does a capture signal resistance (kind or a tribal-knowledge tag)? */
function isResistanceSignal(kind: string, tags: string[]): boolean {
  if (RESISTANCE_KINDS.has(kind)) return true;
  return tags.some((t) => /tribal/i.test(t));
}

/**
 * Per-department adoption-risk rows for a sprint, ordered most-resistant first.
 * Departments with no opportunities are omitted (we don't claim zero risk for
 * teams the sprint hasn't surfaced work in).
 */
export async function computeAdoptionRisk(
  tx: Db,
  sprintId: string,
): Promise<AdoptionRiskRow[]> {
  const oppRows = await tx
    .select({
      departments: opportunities.departments,
      dimensionScores: opportunities.dimensionScores,
    })
    .from(opportunities)
    .where(eq(opportunities.sprintId, sprintId));

  // department -> { scores[], oppCount }
  const byDept = new Map<string, { scores: number[]; oppCount: number }>();
  for (const o of oppRows) {
    const cm = changeMgmtScore(o.dimensionScores);
    for (const dept of o.departments ?? []) {
      const e = byDept.get(dept) ?? { scores: [], oppCount: 0 };
      e.oppCount += 1;
      if (cm != null) e.scores.push(cm);
      byDept.set(dept, e);
    }
  }

  if (byDept.size === 0) return [];

  // Resistance signals per department (role/department only — never a name).
  const capRows = await tx
    .select({
      department: users.department,
      kind: captures.kind,
      tags: captures.tags,
    })
    .from(captures)
    .innerJoin(sessions, eq(captures.sessionId, sessions.id))
    .innerJoin(users, eq(captures.userId, users.id))
    .where(and(eq(sessions.sprintId, sprintId), eq(captures.isRemoved, false)));

  const signalByDept = new Map<string, number>();
  for (const c of capRows) {
    if (!c.department) continue;
    if (isResistanceSignal(c.kind, c.tags ?? [])) {
      signalByDept.set(c.department, (signalByDept.get(c.department) ?? 0) + 1);
    }
  }

  const rows: AdoptionRiskRow[] = [...byDept.entries()].map(
    ([department, { scores, oppCount }]) => {
      const avg =
        scores.length > 0
          ? Math.round(
              (scores.reduce((s, n) => s + n, 0) / scores.length) * 10,
            ) / 10
          : 5; // no scored dimension yet → neutral midpoint
      const resistanceSignalCount = signalByDept.get(department) ?? 0;
      return {
        department,
        avgChangeMgmtScore: avg,
        oppCount,
        resistanceSignalCount,
        level: adoptionLevel(avg, resistanceSignalCount),
      };
    },
  );

  // Most resistant first: high → low, then by signal count.
  const order: Record<AdoptionRiskLevel, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  return rows.sort(
    (a, b) =>
      order[a.level] - order[b.level] ||
      b.resistanceSignalCount - a.resistanceSignalCount,
  );
}
