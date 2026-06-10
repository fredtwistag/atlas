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

import { sendEmail } from "./send";

const element = createElement("div", null, "hi");

beforeEach(() => {
  sendMock.mockReset();
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
});

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
});

describe("sendEmail", () => {
  it("no-ops and logs when RESEND_API_KEY is unset", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const result = await sendEmail({
      to: "ic@a.example",
      subject: "Hello",
      react: element,
    });
    expect(result).toEqual({ sent: false, skipped: true });
    expect(sendMock).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining("[email] skipped"),
    );
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
});
