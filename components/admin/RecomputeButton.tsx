"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Plan 016 Step 5 — manual recompute trigger. Twistag runs this after each
 * day's sessions (automatic scheduling is plan 020). `action` is bound to the
 * sprint id upstream.
 */
export function RecomputeButton({
  action,
  label = "Recompute opportunities",
}: {
  action: () => Promise<void>;
  label?: string;
}) {
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() => {
          setFeedback(null);
          start(async () => {
            try {
              await action();
              setFeedback("Recomputed.");
            } catch {
              setFeedback("Couldn't recompute.");
            }
          });
        }}
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {pending ? "Recomputing…" : label}
      </Button>
      {feedback ? (
        <span className="text-xs text-text-3">{feedback}</span>
      ) : null}
    </span>
  );
}
