import { describe, it, expect } from "vitest";
import { pluralize } from "./text";

describe("pluralize", () => {
  it("keeps singular for 1", () => {
    expect(pluralize(1, "contributor")).toBe("1 contributor");
  });
  it("adds -s for other counts", () => {
    expect(pluralize(3, "contributor")).toBe("3 contributors");
    expect(pluralize(0, "contributor")).toBe("0 contributors");
  });
  it("uses an explicit plural form when given", () => {
    expect(pluralize(2, "voice", "voices")).toBe("2 voices");
  });
});
