"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

const STATUSES = ["active", "onboarding", "paused", "churned"];

/** Edit a company's ops-level fields. Inline feedback (no redirect, tab-safe). */
export function CompanyEditForm({
  initial,
  action,
}: {
  initial: { name: string; segment: string; status: string };
  action: (input: {
    name: string;
    segment: string;
    status: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [segment, setSegment] = useState(initial.segment);
  const [status, setStatus] = useState(initial.status);
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "error";
    msg: string;
  } | null>(null);

  const statusOptions = Array.from(new Set([initial.status, ...STATUSES]));
  const dirty =
    name !== initial.name ||
    segment !== initial.segment ||
    status !== initial.status;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    start(async () => {
      try {
        await action({ name, segment, status });
        setFeedback({ kind: "ok", msg: "Company updated." });
      } catch {
        setFeedback({ kind: "error", msg: "Couldn't save those changes." });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-3">
      <div>
        <Label htmlFor="company-name">Name</Label>
        <Input
          id="company-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="company-segment">Segment</Label>
        <Input
          id="company-segment"
          value={segment}
          onChange={(e) => setSegment(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="company-status">Status</Label>
        <select
          id="company-status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-9 w-full rounded border border-border bg-surface px-3 text-base"
        >
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="brand" disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        {feedback ? (
          <span
            role={feedback.kind === "error" ? "alert" : undefined}
            className={
              feedback.kind === "error"
                ? "text-sm text-danger"
                : "text-sm text-text-3"
            }
          >
            {feedback.msg}
          </span>
        ) : null}
      </div>
    </form>
  );
}
