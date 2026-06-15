import { describe, it, expect, vi, beforeEach } from "vitest";

const mockWebSearch = vi.fn();
vi.mock("@/services/llm/client", () => ({
  completeWithWebSearch: (...args: unknown[]) => mockWebSearch(...args),
}));

import { enrichCompanyContext } from "./search";

beforeEach(() => mockWebSearch.mockReset());

describe("enrichCompanyContext (CTX-2)", () => {
  it("passes the company name + domain to the web-search call and returns the profile", async () => {
    mockWebSearch.mockResolvedValue({
      summary: "B2B distributor",
      industry: "Wholesale distribution",
      businessModel: null,
      sizeBand: "200-500",
      revenueBand: null,
      maturity: null,
      keySystems: ["NetSuite"],
      knownPains: ["manual quoting"],
      sources: [{ label: "company site", ref: "https://x.com" }],
    });

    const out = await enrichCompanyContext({
      companyName: "Northwind",
      domain: "northwind.com",
    });

    expect(out.industry).toBe("Wholesale distribution");
    const call = mockWebSearch.mock.calls[0][0];
    expect(call.messages[0].content).toContain("Northwind");
    expect(call.messages[0].content).toContain("northwind.com");
    // The schema is handed to the validated web-search path.
    expect(call.schema).toBeDefined();
  });

  it("omits the domain line when none is given", async () => {
    mockWebSearch.mockResolvedValue({
      summary: null,
      industry: null,
      businessModel: null,
      sizeBand: null,
      revenueBand: null,
      maturity: null,
      keySystems: [],
      knownPains: [],
      sources: [],
    });
    await enrichCompanyContext({ companyName: "Acme" });
    const call = mockWebSearch.mock.calls[0][0];
    expect(call.messages[0].content).not.toContain("DOMAIN:");
  });
});
