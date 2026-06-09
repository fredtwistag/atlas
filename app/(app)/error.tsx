"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In the backend phase this forwards to Sentry/Highlight.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <h1 className="font-serif text-2xl font-medium tracking-tight">
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
