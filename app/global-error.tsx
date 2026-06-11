"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Root error boundary. Next renders this (replacing the root layout) when an
 * error escapes the layout itself — the one place the nested `(app)/error.tsx`
 * can't catch. Plan 023: it forwards the error to Sentry, then shows a minimal,
 * self-contained fallback (no design-system imports — the layout that provides
 * them is what failed).
 *
 * A no-op without a DSN, so dev/CI are unaffected.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <main style={{ maxWidth: "28rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>
            Atlas hit an error.
          </h1>
          <p style={{ marginTop: "0.5rem", color: "#555" }}>
            The page failed to load. Reload to try again — if it keeps happening,
            the service may be briefly unavailable.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: "1.25rem",
              padding: "0.5rem 1rem",
              minHeight: "44px",
              borderRadius: "0.5rem",
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
