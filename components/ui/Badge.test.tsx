import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders its children", () => {
    render(<Badge tone="success">Done</Badge>);
    expect(screen.getByText("Done")).toBeInTheDocument();
  });
});
