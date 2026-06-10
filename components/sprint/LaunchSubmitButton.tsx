"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";

/**
 * Submit button for the launch form. Uses useFormStatus so the pending state
 * (and its aria-busy announcement) tracks the server action, not local state.
 */
export function LaunchSubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="brand"
      size="lg"
      disabled={disabled || pending}
      aria-busy={pending}
    >
      {pending ? "Launching…" : "Launch sprint"}
    </Button>
  );
}
