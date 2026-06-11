import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./prompts";

const base = {
  userName: "Sam Rivera",
  department: "Finance",
  topicTitle: "Quote-to-cash handoffs",
  topicDescription: "How a quote becomes cash.",
} as const;

describe("buildSystemPrompt — composition", () => {
  it("includes the topic title and the user name", () => {
    const p = buildSystemPrompt({ ...base, role: "ic", arc: "ARC_1" });
    expect(p).toContain("Quote-to-cash handoffs");
    expect(p).toContain("Sam Rivera");
    expect(p).toContain("Finance");
  });

  it("pulls in the IC role corpus", () => {
    const p = buildSystemPrompt({ ...base, role: "ic", arc: "ARC_1" });
    // A marker unique to prompts/role-prompts/ic-role-prompts.md.
    expect(p).toContain("Individual Contributor");
  });

  it("pulls in the manager role corpus for managers", () => {
    const p = buildSystemPrompt({ ...base, role: "manager", arc: "ARC_1" });
    // A marker unique to prompts/role-prompts/manager-role-prompts.md.
    expect(p).toContain("Department Head");
    expect(p).not.toContain("Individual Contributor in");
  });

  it("pulls in the CEO/Sponsor corpus for sponsors", () => {
    const p = buildSystemPrompt({ ...base, role: "sponsor", arc: "ARC_1" });
    // A marker unique to prompts/role-prompts/ceo-sponsor-role-prompts.md.
    expect(p).toContain("CEO or executive sponsor");
  });

  it("always includes the discovery rubric and probe patterns", () => {
    const p = buildSystemPrompt({ ...base, role: "ic", arc: "ARC_2" });
    expect(p).toContain("4-arc"); // discovery-rubric.md
    expect(p).toContain("Probe Patterns"); // probe-patterns.md
  });
});

describe("buildSystemPrompt — arc sensitivity", () => {
  it("changes the arc instruction when the arc changes", () => {
    const a1 = buildSystemPrompt({ ...base, role: "ic", arc: "ARC_1" });
    const a2 = buildSystemPrompt({ ...base, role: "ic", arc: "ARC_2" });
    expect(a1).not.toBe(a2);
    expect(a1).toContain("ARC 1 of 4");
    expect(a1).toContain("Workflow walkthrough");
    expect(a2).toContain("ARC 2 of 4");
    expect(a2).toContain("Frustration mining");
  });

  it("frames INTRO as the opener without an arc number", () => {
    const intro = buildSystemPrompt({ ...base, role: "ic", arc: "INTRO" });
    expect(intro).toContain("opening the session");
    expect(intro).not.toContain("ARC 1 of 4");
  });

  it("frames CLOSE as a wrap-up that asks no further question", () => {
    const close = buildSystemPrompt({ ...base, role: "ic", arc: "CLOSE" });
    expect(close).toContain("Closing");
    expect(close).toContain("reviewable in their dashboard");
  });

  it("tolerates a null department", () => {
    const p = buildSystemPrompt({
      ...base,
      department: null,
      role: "ic",
      arc: "ARC_1",
    });
    expect(p).toContain("their department");
  });
});
