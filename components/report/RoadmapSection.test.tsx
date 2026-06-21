// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RoadmapSection } from "./RoadmapSection";
import type { Opportunity } from "@/lib/types";

const o = (title: string, horizon: string): Opportunity => ({ id: title, title, horizon } as unknown as Opportunity);

describe("RoadmapSection", () => {
  it("buckets opportunities by horizon", () => {
    render(<RoadmapSection opps={[o("QW", "quick_win"), o("SB", "strategic_bet"), o("MID", "standard")]} />);
    expect(screen.getByText("QW")).toBeTruthy();
    expect(screen.getByText("SB")).toBeTruthy();
    expect(screen.getByText("MID")).toBeTruthy();
  });
});
