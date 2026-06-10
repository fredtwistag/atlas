"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const ROLE_OPTIONS = [
  { value: "ic", label: "Team member" },
  { value: "sponsor", label: "Sponsor" },
  { value: "manager", label: "Manager" },
] as const;

/**
 * One member row with inline role change + remove. Managers/sponsors see the
 * controls; the row for yourself is read-only (you can't change or remove your
 * own access). Errors from the guards (e.g. last manager) surface inline.
 */
export function MemberRow({
  id,
  name,
  email,
  role,
  isSelf,
  canManage,
  onUpdateRole,
  onRemove,
}: {
  id: string;
  name: string;
  email: string;
  role: string;
  isSelf: boolean;
  canManage: boolean;
  onUpdateRole: (userId: string, role: string) => Promise<void>;
  onRemove: (userId: string) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function run(fn: () => Promise<void>) {
    setError(null);
    start(async () => {
      try {
        await fn();
      } catch {
        setError("Couldn't apply that change.");
      }
    });
  }

  const editable = canManage && !isSelf;

  return (
    <Card className="px-5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={name} size="sm" />
          <div className="min-w-0">
            <div className="truncate font-medium leading-tight">
              {name}
              {isSelf ? (
                <span className="ml-1.5 text-xs font-normal text-text-3">
                  (you)
                </span>
              ) : null}
            </div>
            <div className="truncate text-xs text-text-3">{email}</div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {editable ? (
            <>
              <select
                aria-label={`Role for ${name}`}
                value={role}
                disabled={pending}
                onChange={(e) => run(() => onUpdateRole(id, e.target.value))}
                className="h-8 rounded border border-border bg-surface px-2 text-[13px] disabled:opacity-50"
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label={`Remove ${name}`}
                title="Remove member"
                disabled={pending}
                onClick={() => setConfirmOpen(true)}
                className="grid h-[44px] w-[44px] place-items-center rounded-sm text-text-3 transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          ) : (
            <Badge tone={role === "manager" ? "brand" : "neutral"}>
              {role}
            </Badge>
          )}
        </div>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirmOpen}
        title={`Remove ${name} from the team?`}
        description="Their sprint sessions are deleted too. This can't be undone."
        confirmLabel="Remove"
        destructive
        pending={pending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          run(() => onRemove(id));
        }}
      />
    </Card>
  );
}
