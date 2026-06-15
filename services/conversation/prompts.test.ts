import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./prompts";

const base = {
  tenantName: "Northwind Trading",
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

  it("anchors the prompt to the client org by name", () => {
    const p = buildSystemPrompt({ ...base, role: "ic", arc: "ARC_1" });
    expect(p).toContain("helping Northwind Trading understand");
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

describe("buildSystemPrompt — company context (CTX-4)", () => {
  it("renders industry, summary, systems and pains when provided", () => {
    const p = buildSystemPrompt({
      ...base,
      role: "ic",
      arc: "ARC_1",
      companyContext: {
        summary: "manual quoting slows enterprise deals",
        industry: "Wholesale distribution",
        keySystems: ["NetSuite", "Excel"],
        knownPains: ["pricing approvals"],
      },
    });
    expect(p).toContain("CONTEXT ON THE BUSINESS:");
    expect(p).toContain("Wholesale distribution");
    expect(p).toContain("Known systems in play: NetSuite, Excel.");
    expect(p).toContain("Known pain areas to listen for: pricing approvals.");
  });

  it("omits the block entirely when there is no company context", () => {
    const p = buildSystemPrompt({ ...base, role: "ic", arc: "ARC_1" });
    expect(p).not.toContain("CONTEXT ON THE BUSINESS:");
    expect(p).not.toContain("Known systems in play:");
  });
});

describe("buildSystemPrompt — cross-session themes (EXT-1)", () => {
  it("injects sprint themes inside an interview arc with a corroborate/extend nudge", () => {
    const p = buildSystemPrompt({
      ...base,
      role: "ic",
      arc: "ARC_1",
      sprintThemes: ["Pricing approval delay", "Manual CSV exports"],
    });
    expect(p).toContain("THEMES OTHERS ON THIS SPRINT HAVE RAISED");
    expect(p).toContain("Pricing approval delay; Manual CSV exports");
    expect(p).toContain("corroborate or extend");
  });

  it("omits the themes line when there are none, or outside an interview arc", () => {
    const none = buildSystemPrompt({ ...base, role: "ic", arc: "ARC_1" });
    expect(none).not.toContain("THEMES OTHERS ON THIS SPRINT");
    const intro = buildSystemPrompt({
      ...base,
      role: "ic",
      arc: "INTRO",
      sprintThemes: ["Pricing approval delay"],
    });
    expect(intro).not.toContain("THEMES OTHERS ON THIS SPRINT");
  });
});

describe("buildSystemPrompt — arc history, probe budget, captures", () => {
  it("renders arc history and probe budget inside an interview arc", () => {
    const p = buildSystemPrompt({
      ...base,
      role: "ic",
      arc: "ARC_2",
      arcHistory: "Workflow walkthrough",
      probesRemaining: 1,
    });
    expect(p).toContain("ARC HISTORY: Workflow walkthrough");
    expect(p).toContain(
      "PROBE BUDGET FOR THIS ARC: 1 probe(s) remaining out of 2.",
    );
  });

  it("falls back to 'none yet' when no arcs are complete", () => {
    const p = buildSystemPrompt({
      ...base,
      role: "ic",
      arc: "ARC_1",
      arcHistory: "",
      probesRemaining: 2,
    });
    expect(p).toContain("ARC HISTORY: none yet");
  });

  it("omits arc-progress blocks outside an interview arc", () => {
    const intro = buildSystemPrompt({ ...base, role: "ic", arc: "INTRO" });
    expect(intro).not.toContain("ARC HISTORY:");
    expect(intro).not.toContain("PROBE BUDGET");
  });

  it("renders the captures summary when present, omits it when absent", () => {
    const withCaps = buildSystemPrompt({
      ...base,
      role: "ic",
      arc: "ARC_2",
      capturesSummary: "- bottleneck: manual CSV export every Friday",
    });
    expect(withCaps).toContain("CAPTURED SO FAR:");
    expect(withCaps).toContain("manual CSV export every Friday");

    const without = buildSystemPrompt({ ...base, role: "ic", arc: "ARC_2" });
    expect(without).not.toContain("CAPTURED SO FAR:");
  });
});
