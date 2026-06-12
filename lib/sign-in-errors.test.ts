import { describe, it, expect } from "vitest";
import { signInErrorMessage } from "./sign-in-errors";

describe("signInErrorMessage", () => {
  it("maps auth (expired/used link)", () => {
    expect(signInErrorMessage("auth")).toMatch(/expired or was already used/i);
  });

  it("maps no-access (not in a workspace)", () => {
    expect(signInErrorMessage("no-access")).toMatch(
      /isn't part of an Atlas workspace/i,
    );
  });

  it("maps invite-expired (plan 025)", () => {
    expect(signInErrorMessage("invite-expired")).toMatch(
      /invitation has expired\. Ask your manager to resend it/i,
    );
  });

  it("returns null for no code or an unknown code", () => {
    expect(signInErrorMessage(null)).toBeNull();
    expect(signInErrorMessage(undefined)).toBeNull();
    expect(signInErrorMessage("whatever")).toBeNull();
  });
});
