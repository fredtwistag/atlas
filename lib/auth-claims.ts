/** Resolved identity from a verified access-token payload. */
export type Claims =
  | { kind: "twistag"; twistagRole: string; userId: string }
  | { kind: "tenant"; tenantId: string; role: string; userId: string }
  | null;

/** Extract Atlas claims from a decoded JWT payload (injected by the access-token hook). */
export function parseClaims(
  payload: Record<string, unknown> | null | undefined,
): Claims {
  if (!payload) return null;
  const sub = typeof payload.sub === "string" ? payload.sub : "";

  if (typeof payload.twistag_role === "string") {
    return { kind: "twistag", twistagRole: payload.twistag_role, userId: sub };
  }

  if (
    typeof payload.tenant_id === "string" &&
    typeof payload.role === "string"
  ) {
    const userId = typeof payload.user_id === "string" ? payload.user_id : sub;
    return {
      kind: "tenant",
      tenantId: payload.tenant_id,
      role: payload.role,
      userId,
    };
  }

  return null;
}

/** Decode the payload of a JWT (no verification — caller must have verified it). */
export function decodeJwtPayload(
  token: string,
): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = Buffer.from(part, "base64url").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}
