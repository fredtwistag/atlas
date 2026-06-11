"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/Button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Plan 023: forward the render error to Sentry. A no-op when no DSN is set,
    // so dev/CI behave as before. The scrubber strips any PII before send; the
    // Error itself is what we want, not the component tree's content.
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Something didn&apos;t load.
      </h1>
      <p className="mt-2 text-md text-text-2">
        This view hit an error. You can retry — if it keeps happening, the data
        source may be temporarily unavailable.
      </p>
      <Button variant="brand" className="mt-5" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
