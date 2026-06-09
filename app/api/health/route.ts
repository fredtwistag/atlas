import { NextResponse } from "next/server";

/**
 * Health endpoint (docs/02-architecture.md §11).
 * In production this checks DB + LLM + email provider. In the demo build there
 * are no external dependencies, so it reports the app itself as healthy and
 * marks the integrations as not-yet-configured.
 */
export function GET() {
  return NextResponse.json({
    status: "ok",
    app: "atlas-web",
    checks: {
      app: "ok",
      database: "not_configured",
      llm: "not_configured",
      email: "not_configured",
    },
  });
}
