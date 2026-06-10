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

interface Cap {
  id: string;
  kind: string;
  summary: string;
  removed?: boolean;
}

export function EditCaptures({
  topicTitle,
  completedAt,
  editWindowEndsAt,
  captures: initial,
}: {
  topicTitle: string;
  completedAt: string;
  editWindowEndsAt: string;
  captures: { id: string; kind: string; summary: string }[];
}) {
  const [caps, setCaps] = useState<Cap[]>(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [buffer, setBuffer] = useState("");

  function startEdit(c: Cap) {
    setEditing(c.id);
    setBuffer(c.summary);
  }
  function save(id: string) {
    setCaps((cs) =>
      cs.map((c) => (c.id === id ? { ...c, summary: buffer } : c)),
    );
    setEditing(null);
  }
  function toggleRemove(id: string) {
    setCaps((cs) =>
      cs.map((c) => (c.id === id ? { ...c, removed: !c.removed } : c)),
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
      <p className="mb-6 text-md text-text-2">
        This is what Atlas captured from your session. Edit anything that&apos;s
        off, or remove what you&apos;d rather not share.{" "}
        <span className="text-text-3">Editable until {editWindowEndsAt}.</span>
      </p>

      <div className="space-y-2.5">
        {caps.map((c) => (
          <Card key={c.id} className={cn("p-4", c.removed && "opacity-50")}>
            <div className="mb-2 flex items-center justify-between">
              <Badge tone="neutral">{c.kind}</Badge>
              <div className="flex items-center gap-1">
                {!c.removed && editing !== c.id && (
                  <button
                    onClick={() => startEdit(c)}
                    className="grid h-[44px] w-[44px] place-items-center rounded text-text-3 hover:bg-surface-2 hover:text-text"
                    aria-label="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => toggleRemove(c.id)}
                  className={cn(
                    "grid h-[44px] w-[44px] place-items-center rounded hover:bg-surface-2",
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
            </div>

            {editing === c.id ? (
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
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" variant="brand" onClick={() => save(c.id)}>
                    Save
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
          </Card>
        ))}
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
