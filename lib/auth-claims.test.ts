import { describe, it, expect } from "vitest";
import { parseClaims, decodeJwtPayload } from "./auth-claims";

describe("parseClaims", () => {
  it("returns a twistag identity when twistag_role is present", () => {
    expect(
      parseClaims({ sub: "u1", twistag_role: "twistag_admin", email: "a@x" }),
    ).toEqual({ kind: "twistag", twistagRole: "twistag_admin", userId: "u1" });
  });

  it("returns a tenant identity with tenant_id/role/user_id", () => {
    expect(
      parseClaims({
        sub: "auth1",
        tenant_id: "t1",
        role: "manager",
        user_id: "u9",
      }),
    ).toEqual({
      kind: "tenant",
      tenantId: "t1",
      role: "manager",
      userId: "u9",
    });
  });

  it("returns null when no Atlas claims are present", () => {
    expect(parseClaims({ sub: "u1", email: "a@x" })).toBeNull();
    expect(parseClaims(null)).toBeNull();
  });
});

describe("decodeJwtPayload", () => {
  it("decodes the payload segment", () => {
    const payload = { tenant_id: "t1", role: "ic" };
    const seg = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const token = `header.${seg}.sig`;
    expect(decodeJwtPayload(token)).toEqual(payload);
  });

  it("returns null on a malformed token", () => {
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
  });
});
