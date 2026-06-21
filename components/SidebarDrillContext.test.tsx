// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SidebarDrillProvider, useSidebarDrill } from "./SidebarDrillContext";

function Probe() {
  const { config, setConfig } = useSidebarDrill();
  return (
    <div>
      <span data-testid="title">{config?.title ?? "none"}</span>
      <button onClick={() => setConfig({ backLabel: "Overview", backHref: "/sprint", title: "Report", sections: [], decision: null })}>
        set
      </button>
      <button onClick={() => setConfig(null)}>clear</button>
    </div>
  );
}

describe("SidebarDrillContext", () => {
  it("starts null and round-trips a config through the provider", () => {
    render(<SidebarDrillProvider><Probe /></SidebarDrillProvider>);
    expect(screen.getByTestId("title").textContent).toBe("none");
    fireEvent.click(screen.getByText("set"));
    expect(screen.getByTestId("title").textContent).toBe("Report");
    fireEvent.click(screen.getByText("clear"));
    expect(screen.getByTestId("title").textContent).toBe("none");
  });
  it("useSidebarDrill outside a provider is a safe no-op (default null)", () => {
    render(<Probe />);
    expect(screen.getByTestId("title").textContent).toBe("none");
    fireEvent.click(screen.getByText("set")); // no provider — setConfig is a no-op
    expect(screen.getByTestId("title").textContent).toBe("none");
  });
});
