import { describe, it, expect } from "vitest";
import { captureStats, routeKinds } from "./stats";
import type { WorkflowCapture } from "./types";

function cap(p: Partial<WorkflowCapture>): WorkflowCapture {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "sop",
    summary: "x",
    role: "Sales rep",
    department: "Sales",
    contributorId: "u1",
    ...p,
  };
}

describe("captureStats", () => {
  it("counts kinds, distinct roles, handoffs and systemish", () => {
    const s = captureStats([
      cap({ kind: "handoff", role: "Sales rep" }),
      cap({ kind: "sop", role: "Ops" }),
      cap({ kind: "tooling", role: "Ops" }),
      cap({ kind: "workaround", role: "Finance" }),
    ]);
    expect(s.total).toBe(4);
    expect(s.distinctRoles).toBe(3);
    expect(s.handoffCount).toBe(1);
    expect(s.systemishCount).toBe(2);
    expect(s.stepish).toBe(3); // handoff + sop + workaround
  });
});

describe("routeKinds", () => {
  it("includes swimlane only with ≥3 stepish, ≥2 roles, ≥1 handoff", () => {
    const eligible = captureStats([
      cap({ kind: "handoff", role: "Sales rep" }),
      cap({ kind: "sop", role: "Ops" }),
      cap({ kind: "decision", role: "Finance" }),
    ]);
    expect(routeKinds(eligible, 0)).toContain("swimlane");

    const noHandoff = captureStats([
      cap({ kind: "sop", role: "Ops" }),
      cap({ kind: "decision", role: "Finance" }),
      cap({ kind: "bottleneck", role: "Sales rep" }),
    ]);
    expect(routeKinds(noHandoff, 0)).not.toContain("swimlane");
  });

  it("includes systems_topology with ≥2 tooling/workaround", () => {
    const s = captureStats([cap({ kind: "tooling" }), cap({ kind: "workaround" })]);
    expect(routeKinds(s, 0)).toContain("systems_topology");
  });

  it("includes impact_effort with ≥3 opportunities", () => {
    const s = captureStats([cap({})]);
    expect(routeKinds(s, 3)).toContain("impact_effort");
    expect(routeKinds(s, 2)).not.toContain("impact_effort");
  });
});
