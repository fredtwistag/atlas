import { createElement } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Render is mocked so the test never depends on real React Email output.
vi.mock("@react-email/render", () => ({
  render: vi.fn(async () => "<html>rendered</html>"),
}));

// Resend is mocked so no network call is made.
const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

// Observability is mocked so the failure path doesn't reach Sentry in tests; we
// still assert it was CALLED (the send-failure visibility contract, plan 027).
const captureFailureMock = vi.fn();
vi.mock("@/lib/observability", () => ({
  captureFailure: (...a: unknown[]) => captureFailureMock(...a),
}));

import { sendEmail } from "./send";

const element = createElement("div", null, "hi");

beforeEach(() => {
  sendMock.mockReset();
  captureFailureMock.mockReset();
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
});

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
});

describe("sendEmail", () => {
  it("no-ops and logs a content-free skip line when RESEND_API_KEY is unset", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const result = await sendEmail({
      to: "ic@a.example",
      subject: "Hello",
      react: element,
    });
    expect(result).toEqual({ sent: false, skipped: true });
    expect(sendMock).not.toHaveBeenCalled();
    // Structured `email.send.skipped` line (plan 023) — and critically, it must
    // NOT carry the recipient address or subject (PII / content).
    expect(info).toHaveBeenCalledTimes(1);
    const line = info.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.event).toBe("email.send.skipped");
    expect(line).not.toContain("ic@a.example");
    expect(line).not.toContain("Hello");
    info.mockRestore();
  });

  it("renders and sends via Resend when a key is present", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "Atlas <hello@atlas.test>";
    sendMock.mockResolvedValue({ data: { id: "msg_1" }, error: null });

    const result = await sendEmail({
      to: "ic@a.example",
      subject: "Hello",
      react: element,
      replyTo: "manager@a.example",
    });

    expect(result).toEqual({ sent: true, id: "msg_1" });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0][0];
    expect(arg).toMatchObject({
      from: "Atlas <hello@atlas.test>",
      to: "ic@a.example",
      subject: "Hello",
      html: "<html>rendered</html>",
      text: "<html>rendered</html>",
      replyTo: "manager@a.example",
    });
  });

  it("throws when Resend returns an error (so a tx can roll back)", async () => {
    process.env.RESEND_API_KEY = "re_test";
    sendMock.mockResolvedValue({
      data: null,
      error: { message: "rate limited" },
    });

    await expect(
      sendEmail({ to: "ic@a.example", subject: "Hello", react: element }),
    ).rejects.toThrow(/rate limited/);
  });

  it("on a Resend failure logs a content-free email.send.failed line + captures it", async () => {
    process.env.RESEND_API_KEY = "re_test";
    sendMock.mockResolvedValue({
      data: null,
      error: { message: "rate limited" },
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      sendEmail({
        to: "secret-ic@acme.example",
        subject: "Your sprint with Jane Doe",
        react: element,
      }),
    ).rejects.toThrow();

    // A structured `email.send.failed` line was emitted…
    expect(errorLog).toHaveBeenCalled();
    const line = errorLog.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.event).toBe("email.send.failed");
    expect(parsed.area).toBe("email");
    // …and it leaks NEITHER the recipient address NOR the subject (which can
    // echo a person's name). Domains/counts only — never PII (plan 027 Step 2).
    expect(line).not.toContain("secret-ic@acme.example");
    expect(line).not.toContain("acme.example");
    expect(line).not.toContain("Jane Doe");

    // The failure also reaches Sentry tagged area:email (visibility contract).
    expect(captureFailureMock).toHaveBeenCalledTimes(1);
    expect(captureFailureMock.mock.calls[0]?.[1]).toMatchObject({
      area: "email",
    });

    errorLog.mockRestore();
  });
});
