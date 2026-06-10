"use client";

import { useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Closes a sprint after a confirm. Closing is one-way: it marks the sprint
 * completed and frees the org to launch a new one. The action redirects to the
 * report on success.
 */
export function CloseSprintButton({
  onClose,
}: {
  onClose: () => Promise<void>;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="danger"
      disabled={pending}
      onClick={() => {
        if (
          window.confirm(
            "Close this sprint? It will be marked completed and your team can launch a new one. This can't be undone.",
          )
        ) {
          start(() => onClose());
        }
      }}
    >
      <CheckCircle2 className="h-4 w-4" />
      {pending ? "Closing…" : "Close sprint"}
    </Button>
  );
}
