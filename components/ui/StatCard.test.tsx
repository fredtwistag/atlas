import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Activity } from "lucide-react";
import { StatCard } from "./StatCard";

describe("StatCard", () => {
  it("renders label, value, and sub", () => {
    render(
      <StatCard
        icon={Activity}
        label="Participation"
        value="63%"
        sub="20/32 sessions"
      />,
    );
    expect(screen.getByText("Participation")).toBeInTheDocument();
    expect(screen.getByText("63%")).toBeInTheDocument();
    expect(screen.getByText("20/32 sessions")).toBeInTheDocument();
  });

  it("omits sub when not provided", () => {
    const { container } = render(
      <StatCard icon={Activity} label="X" value="1" />,
    );
    expect(container.textContent).not.toContain("undefined");
  });
});
