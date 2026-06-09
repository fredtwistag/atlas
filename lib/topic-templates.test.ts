import { describe, it, expect } from "vitest";
import { TOPIC_TEMPLATES } from "./topic-templates";

describe("TOPIC_TEMPLATES", () => {
  it("has the four default discovery topics in order", () => {
    expect(TOPIC_TEMPLATES).toHaveLength(4);
    expect(TOPIC_TEMPLATES.map((t) => t.key)).toEqual([
      "how-work-flows",
      "when-things-break",
      "tools-and-systems",
      "one-change",
    ]);
    expect(TOPIC_TEMPLATES.map((t) => t.orderIdx)).toEqual([1, 2, 3, 4]);
  });

  it("every template has a non-empty title/description and positive counts", () => {
    for (const t of TOPIC_TEMPLATES) {
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.questionCount).toBeGreaterThan(0);
      expect(t.estMinutes).toBeGreaterThan(0);
    }
  });
});
