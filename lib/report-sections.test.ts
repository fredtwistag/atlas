import { describe, it, expect } from "vitest";
import { REPORT_SECTIONS } from "./report-sections";

describe("REPORT_SECTIONS", () => {
  it("lists the report's drillable sections with unique ids", () => {
    expect(REPORT_SECTIONS.map((s) => s.id)).toEqual(["summary", "findings", "opportunities", "roadmap"]);
    const ids = new Set(REPORT_SECTIONS.map((s) => s.id));
    expect(ids.size).toBe(REPORT_SECTIONS.length);
    expect(REPORT_SECTIONS.find((s) => s.id === "findings")?.label).toBe("What we found");
  });
});
