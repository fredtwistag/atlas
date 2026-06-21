// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useScrollSpy } from "./use-scroll-spy";

let lastCallback: ((entries: unknown[]) => void) | null = null;
class MockIO {
  constructor(cb: (entries: unknown[]) => void) {
    lastCallback = cb;
  }
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  lastCallback = null;
  vi.stubGlobal("IntersectionObserver", MockIO as unknown as typeof IntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Probe({ ids }: { ids: string[] }) {
  const active = useScrollSpy(ids);
  return <span data-testid="active">{active ?? "none"}</span>;
}

describe("useScrollSpy", () => {
  it("defaults to the first id, then tracks the intersecting section", () => {
    render(
      <>
        <div id="a" /><div id="b" />
        <Probe ids={["a", "b"]} />
      </>,
    );
    expect(screen.getByTestId("active").textContent).toBe("a");
    act(() => {
      lastCallback?.([{ isIntersecting: true, target: { id: "b" }, boundingClientRect: { top: 10 } }]);
    });
    expect(screen.getByTestId("active").textContent).toBe("b");
  });
});
