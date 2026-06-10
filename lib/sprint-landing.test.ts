import { describe, it, expect } from "vitest";
import { sprintLandingPath } from "./sprint-landing";

const ID = "33333333-3333-4333-8333-3333333333a1";

describe("sprintLandingPath", () => {
  it("sends a sponsor to the executive report", () => {
    expect(sprintLandingPath("sponsor", ID)).toBe(`/sprint/${ID}/report`);
  });

  it("sends a manager to the ops dashboard", () => {
    expect(sprintLandingPath("manager", ID)).toBe(`/sprint/${ID}`);
  });

  it("sends an IC to their own page", () => {
    expect(sprintLandingPath("ic", ID)).toBe("/me");
    expect(sprintLandingPath("", ID)).toBe("/me");
  });
});
