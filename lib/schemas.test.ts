import { describe, it, expect } from "vitest";
import { CaptureSchema, ExtractionSchema, LaunchSprintSchema } from "./schemas";

describe("CaptureSchema", () => {
  it("accepts a valid capture", () => {
    const ok = CaptureSchema.safeParse({
      kind: "bottleneck",
      summary: "Credit-hold queue is worked once daily, delaying release.",
      source_quote: "I have to physically get to them.",
      tags: ["credit-hold"],
      confidence: 0.8,
    });
    expect(ok.success).toBe(true);
  });

  it("rejects a too-short summary", () => {
    const bad = CaptureSchema.safeParse({
      kind: "bottleneck",
      summary: "short",
      source_quote: "x",
      tags: [],
      confidence: 0.5,
    });
    expect(bad.success).toBe(false);
  });

  it("rejects an unknown kind", () => {
    const bad = CaptureSchema.safeParse({
      kind: "nonsense",
      summary: "this summary is definitely long enough to pass",
      source_quote: "x",
      tags: [],
      confidence: 0.5,
    });
    expect(bad.success).toBe(false);
  });

  it("validates extraction envelope with nullable notes", () => {
    const ok = ExtractionSchema.safeParse({
      captures: [],
      notes_for_next_probe: null,
    });
    expect(ok.success).toBe(true);
  });
});

describe("LaunchSprintSchema", () => {
  const ok = {
    name: "Operations Discovery",
    primaryFocus: "Quote-to-cash",
    topicKeys: ["how-work-flows"],
    participantIds: ["00000000-0000-4000-8000-000000000001"],
  };

  it("accepts a valid launch payload", () => {
    expect(LaunchSprintSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects empty topic or participant lists", () => {
    expect(LaunchSprintSchema.safeParse({ ...ok, topicKeys: [] }).success).toBe(
      false,
    );
    expect(
      LaunchSprintSchema.safeParse({ ...ok, participantIds: [] }).success,
    ).toBe(false);
  });

  it("rejects a non-uuid participant id", () => {
    expect(
      LaunchSprintSchema.safeParse({ ...ok, participantIds: ["nope"] }).success,
    ).toBe(false);
  });
});
