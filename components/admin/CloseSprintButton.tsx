"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/** Close a sprint behind a confirm dialog. `action` is bound to the sprint id. */
export function CloseSprintButton({
  sprintName,
  action,
}: {
  sprintName: string;
  action: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        Close sprint
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
      <ConfirmDialog
        open={open}
        title={`Close “${sprintName}”?`}
        description="This marks the sprint completed and frees the tenant to launch a new one."
        confirmLabel="Close sprint"
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          setError(null);
          start(async () => {
            try {
              await action();
            } catch {
              setError("Couldn't close it.");
            }
          });
        }}
      />
    </span>
  );
}
