import { describe, it, expect } from "vitest";
import { landingPathFor } from "./landing";

describe("landingPathFor", () => {
  it("routes by role", () => {
    expect(landingPathFor("twistag_admin")).toBe("/admin");
    expect(landingPathFor("twistag_lead")).toBe("/admin");
    expect(landingPathFor("manager")).toBe("/sprint");
    expect(landingPathFor("sponsor")).toBe("/sprint");
    expect(landingPathFor("ic")).toBe("/me");
    expect(landingPathFor("")).toBe("/me");
  });
});
