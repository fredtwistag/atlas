import { NextResponse } from "next/server";
import { pingDb } from "@/db/client";
import { env } from "@/lib/env";

/**
 * Health endpoint (docs/02-architecture.md §11). This is the uptime-monitor
 * target (plan 023), so it does REAL checks but never sends/calls anything and
 * never leaks a secret value — only a status word per dependency:
 *
 *  - database: runs `SELECT 1` (2s timeout) → "ok" if reachable, else "error".
 *  - email:    "ok" if RESEND_API_KEY is present, "not_configured" otherwise
 *              (no send — that would cost money and could rate-limit).
 *  - llm:      "ok" if ANTHROPIC_API_KEY is present, "not_configured" otherwise
 *              (no API call — same reasoning).
 *
 * Status is 200 ONLY when the database is "ok"; 503 otherwise, so a monitor
 * pages on a real outage but not on a missing optional integration.
 *
 * Not cached: each probe must reflect live state.
 */
export const dynamic = "force-dynamic";

type Check = "ok" | "error" | "not_configured";

const DB_TIMEOUT_MS = 2000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    ),
  ]);
}

async function checkDatabase(): Promise<Check> {
  try {
    await withTimeout(pingDb(), DB_TIMEOUT_MS);
    return "ok";
  } catch {
    // Deliberately swallow the error — it can contain connection-string detail.
    return "error";
  }
}

export async function GET() {
  const database = await checkDatabase();
  const email: Check = env.resendApiKey() ? "ok" : "not_configured";
  const llm: Check = env.anthropicApiKey() ? "ok" : "not_configured";

  const healthy = database === "ok";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      app: "atlas-web",
      checks: { app: "ok", database, email, llm },
    },
    { status: healthy ? 200 : 503 },
  );
}
