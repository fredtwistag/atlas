"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { BackLink } from "@/components/ui/BackLink";
import { Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { trpc } from "@/lib/trpc/react";

interface Cap {
  id: string;
  kind: string;
  summary: string;
  removed?: boolean;
}

export function EditCaptures({
  sessionId,
  topicTitle,
  completedAt,
  editWindowEndsAt,
  editable,
  captures: initial,
}: {
  sessionId: string;
  topicTitle: string;
  completedAt: string;
  editWindowEndsAt: string;
  editable: boolean;
  captures: { id: string; kind: string; summary: string }[];
}) {
  const [caps, setCaps] = useState<Cap[]>(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [buffer, setBuffer] = useState("");
  // Per-row id currently saving, and per-row error copy.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // aria-live status announced after a successful save/remove.
  const [status, setStatus] = useState("");

  const updateCapture = trpc.session.updateCapture.useMutation();

  function setError(id: string, message: string) {
    setErrors((e) => ({ ...e, [id]: message }));
  }
  function clearError(id: string) {
    setErrors((e) => {
      if (!(id in e)) return e;
      const next = { ...e };
      delete next[id];
      return next;
    });
  }

  function startEdit(c: Cap) {
    setEditing(c.id);
    setBuffer(c.summary);
    clearError(c.id);
  }

  function save(id: string) {
    const next = buffer;
    setPendingId(id);
    clearError(id);
    updateCapture.mutate(
      { sessionId, captureId: id, summary: next },
      {
        onSuccess: () => {
          setCaps((cs) =>
            cs.map((c) => (c.id === id ? { ...c, summary: next } : c)),
          );
          setEditing(null);
          setPendingId(null);
          setStatus("Saved");
        },
        onError: (err) => {
          // Keep the edit buffer so the IC can retry without retyping.
          setPendingId(null);
          setError(
            id,
            err.message ||
              "That didn't save. Check your connection and try again.",
          );
        },
      },
    );
  }

  function toggleRemove(id: string) {
    const cur = caps.find((c) => c.id === id);
    if (!cur) return;
    const nextRemoved = !cur.removed;
    setPendingId(id);
    clearError(id);
    updateCapture.mutate(
      { sessionId, captureId: id, isRemoved: nextRemoved },
      {
        onSuccess: () => {
          setCaps((cs) =>
            cs.map((c) => (c.id === id ? { ...c, removed: nextRemoved } : c)),
          );
          setPendingId(null);
          setStatus(nextRemoved ? "Removed" : "Restored");
        },
        onError: (err) => {
          setPendingId(null);
          setError(
            id,
            err.message ||
              "That didn't save. Check your connection and try again.",
          );
        },
      },
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-5">
        <BackLink href="/me">Back to my sprint</BackLink>
      </div>

      <div className="mb-2 flex items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{topicTitle}</h1>
        <Badge tone="success">
          <Check className="h-3 w-3" /> Completed {completedAt}
        </Badge>
      </div>

      {editable ? (
        <p className="mb-6 text-md text-text-2">
          This is what Atlas captured from your session. Edit anything
          that&apos;s off, or remove what you&apos;d rather not share.{" "}
          <span className="text-text-3">
            Editable until {editWindowEndsAt}.
          </span>
        </p>
      ) : (
        <p className="mb-6 text-md text-text-2">
          This session can no longer be edited — the 7-day window closed on{" "}
          {editWindowEndsAt}. Below is what Atlas captured.
        </p>
      )}

      {/* Live region: announces save/remove outcomes to assistive tech. */}
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>

      <div className="space-y-2.5">
        {caps.map((c) => {
          const rowPending = pendingId === c.id;
          const rowError = errors[c.id];
          return (
            <Card key={c.id} className={cn("p-4", c.removed && "opacity-50")}>
              <div className="mb-2 flex items-center justify-between">
                <Badge tone="neutral">{c.kind}</Badge>
                {editable && (
                  <div className="flex items-center gap-1">
                    {!c.removed && editing !== c.id && (
                      <button
                        onClick={() => startEdit(c)}
                        disabled={rowPending}
                        className="grid h-[44px] w-[44px] place-items-center rounded text-text-3 hover:bg-surface-2 hover:text-text disabled:opacity-50"
                        aria-label="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => toggleRemove(c.id)}
                      disabled={rowPending}
                      className={cn(
                        "grid h-[44px] w-[44px] place-items-center rounded hover:bg-surface-2 disabled:opacity-50",
                        c.removed
                          ? "text-brand hover:text-brand-hover"
                          : "text-text-3 hover:text-danger",
                      )}
                      aria-label={c.removed ? "Restore" : "Remove"}
                    >
                      {c.removed ? (
                        <RotateCcw className="h-3.5 w-3.5" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                )}
              </div>

              {editable && editing === c.id ? (
                <div>
                  <Textarea
                    rows={3}
                    value={buffer}
                    onChange={(e) => setBuffer(e.target.value)}
                    autoFocus
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(null);
                        clearError(c.id);
                      }}
                      disabled={rowPending}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="brand"
                      onClick={() => save(c.id)}
                      disabled={rowPending}
                    >
                      {rowPending ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              ) : (
                <p
                  className={cn(
                    "text-md leading-relaxed",
                    c.removed && "line-through",
                  )}
                >
                  {c.summary}
                </p>
              )}

              {rowError && (
                <p className="mt-2 text-sm text-danger" role="alert">
                  {rowError}
                </p>
              )}
            </Card>
          );
        })}
        {caps.length === 0 && (
          <Card className="p-8 text-center text-md text-text-3">
            Nothing was captured in this session.
          </Card>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
        <span className="text-sm text-text-2">
          Edits propagate to any opportunity that cites this capture.
        </span>
        <Link href="/me">
          <Button variant="primary" size="sm">
            Done
          </Button>
        </Link>
      </div>
    </main>
  );
}
