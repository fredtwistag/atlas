import { describe, it, expect } from "vitest";
import { reportHeadline } from "./report-hero";

describe("reportHeadline", () => {
  it("leads with the recoverable range and the tenant when there is impact", () => {
    const h = reportHeadline({ tenantName: "Vizta", totalLow: 163000, totalHigh: 314000, currency: "EUR" });
    expect(h).toContain("Vizta");
    expect(h).toMatch(/€16\d?K.*€31\d?K/);
    expect(h.toLowerCase()).toContain("recoverable");
  });
  it("falls back to an honest empty-state line when there is no impact", () => {
    const h = reportHeadline({ tenantName: "Vizta", totalLow: 0, totalHigh: 0, currency: "EUR" });
    expect(h.toLowerCase()).toContain("underway");
    expect(h).not.toContain("€0");
  });
});
