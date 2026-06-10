"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

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
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <>
      <Button
        variant="danger"
        disabled={pending}
        onClick={() => setConfirmOpen(true)}
      >
        <CheckCircle2 className="h-4 w-4" />
        {pending ? "Closing…" : "Close sprint"}
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        title="Close this sprint?"
        description="It will be marked completed and your team can launch a new one. This can't be undone."
        confirmLabel="Close sprint"
        destructive
        pending={pending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          start(() => onClose());
        }}
      />
    </>
  );
}
