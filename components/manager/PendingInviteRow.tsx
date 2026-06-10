"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

/** A pending invitation with Resend / Cancel actions. */
export function PendingInviteRow({
  id,
  email,
  role,
  onResend,
  onCancel,
}: {
  id: string;
  email: string;
  role: string;
  onResend: (invitationId: string) => Promise<void>;
  onCancel: (invitationId: string) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(label: string, fn: () => Promise<void>) {
    setError(null);
    start(async () => {
      try {
        await fn();
        setDone(label);
      } catch {
        setError("That didn't work — try again.");
      }
    });
  }

  return (
    <Card className="px-5 py-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate">{email}</span>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone="warning">{role} · pending</Badge>
          <button
            type="button"
            disabled={pending}
            onClick={() => run("resent", () => onResend(id))}
            className="rounded-sm px-2 py-1 text-[13px] font-medium text-brand transition-colors hover:bg-brand-soft disabled:opacity-50"
          >
            Resend
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run("cancelled", () => onCancel(id))}
            className="rounded-sm px-2 py-1 text-[13px] font-medium text-text-3 transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
      {done ? (
        <p className="mt-1.5 text-xs text-text-3">Invite {done}.</p>
      ) : null}
      {error ? (
        <p className="mt-1.5 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
