import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NudgePreferenceToggle } from "./NudgePreferenceToggle";

// Mock the server action the toggle calls.
const setNudgePreference = vi.fn();
vi.mock("@/app/(app)/me/actions", () => ({
  setNudgePreference: (...a: unknown[]) => setNudgePreference(...(a as [])),
}));

beforeEach(() => {
  setNudgePreference.mockReset();
});

describe("NudgePreferenceToggle (plan 025)", () => {
  it("renders as a switch reflecting the initial state", () => {
    render(<NudgePreferenceToggle initialAllow={true} />);
    const sw = screen.getByRole("switch", {
      name: /allow nudges from your manager/i,
    });
    expect(sw).toHaveAttribute("aria-checked", "true");
  });

  it("turning off calls the action with false and confirms via aria-live", async () => {
    setNudgePreference.mockResolvedValue({ ok: true, allow: false });
    const user = userEvent.setup();
    render(<NudgePreferenceToggle initialAllow={true} />);

    await user.click(screen.getByRole("switch"));

    expect(setNudgePreference).toHaveBeenCalledWith(false);
    await waitFor(() =>
      expect(screen.getByRole("switch")).toHaveAttribute(
        "aria-checked",
        "false",
      ),
    );
    // Confirmation copy lands in a status (aria-live) region (also mirrored in a
    // visible line), so it appears more than once.
    const matches = await screen.findAllByText(/nudges are off/i);
    expect(matches.length).toBeGreaterThan(0);
    // One of them is the aria-live status region.
    expect(matches.some((el) => el.getAttribute("role") === "status")).toBe(
      true,
    );
  });

  it("turning on calls the action with true", async () => {
    setNudgePreference.mockResolvedValue({ ok: true, allow: true });
    const user = userEvent.setup();
    render(<NudgePreferenceToggle initialAllow={false} />);

    await user.click(screen.getByRole("switch"));

    expect(setNudgePreference).toHaveBeenCalledWith(true);
    await waitFor(() =>
      expect(screen.getByRole("switch")).toHaveAttribute(
        "aria-checked",
        "true",
      ),
    );
  });

  it("reverts the toggle and shows an error when the save fails", async () => {
    setNudgePreference.mockResolvedValue({
      ok: false,
      error: "Couldn't save.",
    });
    const user = userEvent.setup();
    render(<NudgePreferenceToggle initialAllow={true} />);

    await user.click(screen.getByRole("switch"));

    // Reverted back to on.
    await waitFor(() =>
      expect(screen.getByRole("switch")).toHaveAttribute(
        "aria-checked",
        "true",
      ),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn't save/i,
    );
  });
});
