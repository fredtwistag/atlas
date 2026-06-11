import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { EditCaptures } from "./EditCaptures";

/**
 * EditCaptures drives a live tRPC mutation (session.updateCapture). We mock the
 * tRPC client so the component logic — pending state, success commit, aria-live
 * status, failure-preserves-buffer, soft remove, and the closed-window
 * read-only state — can be tested without a server. Mirrors the
 * ConversationView test harness (plan 015).
 */

type MutateOpts = {
  onSuccess: (res: { ok: true }) => void;
  onError: (err: { message: string }) => void;
};
type MutateInput = {
  sessionId: string;
  captureId: string;
  summary?: string;
  isRemoved?: boolean;
};

// The test installs the next outcome before each interaction.
let mutateImpl: (input: MutateInput, opts: MutateOpts) => void;
const mutateSpy = vi.fn<(input: MutateInput, opts: MutateOpts) => void>();

vi.mock("@/lib/trpc/react", () => ({
  trpc: {
    session: {
      updateCapture: {
        useMutation: () => ({
          mutate: (input: MutateInput, opts: MutateOpts) => {
            mutateSpy(input, opts);
            mutateImpl(input, opts);
          },
          isPending: false,
        }),
      },
    },
  },
}));

function succeed() {
  mutateImpl = (_input, opts) => opts.onSuccess({ ok: true });
}
function fail(message: string) {
  mutateImpl = (_input, opts) => opts.onError({ message });
}

const CAPS = [
  { id: "cap-1", kind: "PROCESS", summary: "Orders come in by email." },
  { id: "cap-2", kind: "PAIN", summary: "We rekey everything by hand." },
];

function renderEditable() {
  return render(
    <EditCaptures
      sessionId="sess-1"
      topicTitle="How work flows"
      completedAt="Jun 9, 2026"
      editWindowEndsAt="Jun 16, 2026"
      editable
      captures={CAPS}
    />,
  );
}

beforeEach(() => {
  mutateSpy.mockClear();
  succeed();
});

describe("EditCaptures — editable window", () => {
  it("saving an edit calls the mutation and persists the new summary", async () => {
    const user = userEvent.setup();
    renderEditable();

    await user.click(screen.getAllByLabelText("Edit")[0]);
    const box = screen.getByRole("textbox");
    await user.clear(box);
    await user.type(box, "Orders arrive via the web portal.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mutateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "sess-1",
        captureId: "cap-1",
        summary: "Orders arrive via the web portal.",
      }),
      expect.anything(),
    );
    expect(
      await screen.findByText("Orders arrive via the web portal."),
    ).toBeInTheDocument();
    // aria-live confirmation.
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });

  it("a failed save keeps the buffer and shows retry copy", async () => {
    const user = userEvent.setup();
    renderEditable();

    await user.click(screen.getAllByLabelText("Edit")[0]);
    const box = screen.getByRole("textbox");
    await user.clear(box);
    await user.type(box, "Edited but will fail.");
    fail("Network error");
    await user.click(screen.getByRole("button", { name: "Save" }));

    // Still in edit mode with the buffer intact.
    expect(screen.getByRole("textbox")).toHaveValue("Edited but will fail.");
    expect(await screen.findByRole("alert")).toHaveTextContent("Network error");
  });

  it("remove is a soft toggle that strikes the row through", async () => {
    const user = userEvent.setup();
    renderEditable();

    await user.click(screen.getAllByLabelText("Remove")[0]);

    expect(mutateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ captureId: "cap-1", isRemoved: true }),
      expect.anything(),
    );
    // After success the row offers Restore and the text is struck through.
    expect(await screen.findByLabelText("Restore")).toBeInTheDocument();
    expect(screen.getByText("Orders come in by email.")).toHaveClass(
      "line-through",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Removed");
  });

  it("a failed remove leaves the row unchanged", async () => {
    const user = userEvent.setup();
    renderEditable();

    fail("offline");
    await user.click(screen.getAllByLabelText("Remove")[0]);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("offline"),
    );
    // Still removable (not yet removed) — no Restore affordance appeared.
    expect(screen.queryByLabelText("Restore")).not.toBeInTheDocument();
  });
});

describe("EditCaptures — closed window", () => {
  it("renders read-only with the closing date and no edit affordances", () => {
    render(
      <EditCaptures
        sessionId="sess-1"
        topicTitle="How work flows"
        completedAt="Jun 9, 2026"
        editWindowEndsAt="May 1, 2026"
        editable={false}
        captures={CAPS}
      />,
    );

    expect(
      screen.getByText(/the 7-day window closed on May 1, 2026/i),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Edit")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Remove")).not.toBeInTheDocument();
    // Captures still render.
    expect(screen.getByText("Orders come in by email.")).toBeInTheDocument();
  });
});
