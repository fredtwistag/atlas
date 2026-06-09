import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ScoreBadge } from "./ScoreBadge";

describe("ScoreBadge", () => {
  it("renders the score to one decimal", () => {
    render(<ScoreBadge score={8.7} />);
    expect(screen.getByText("8.7")).toBeInTheDocument();
  });
});
