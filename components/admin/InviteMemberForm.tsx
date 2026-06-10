"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

/** Invite a member into a company. Inline feedback (no redirect, tab-safe). */
export function InviteMemberForm({
  action,
}: {
  action: (input: {
    name: string;
    email: string;
    role: string;
  }) => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "error";
    msg: string;
  } | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const email = String(fd.get("email") ?? "").trim();
    const role = String(fd.get("role") ?? "ic");
    setFeedback(null);
    start(async () => {
      try {
        await action({ name, email, role });
        setFeedback({ kind: "ok", msg: `Invited ${email}.` });
        formRef.current?.reset();
      } catch {
        setFeedback({ kind: "error", msg: "Couldn't send that invite." });
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
      <div>
        <Label htmlFor="invite-name">Name</Label>
        <Input id="invite-name" name="name" required placeholder="Sam Rivera" />
      </div>
      <div>
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          name="email"
          type="email"
          required
          placeholder="sam@company.example"
        />
      </div>
      <div>
        <Label htmlFor="invite-role">Role</Label>
        <select
          id="invite-role"
          name="role"
          defaultValue="ic"
          className="h-9 w-full rounded border border-border bg-surface px-3 text-base"
        >
          <option value="ic">Team member (IC)</option>
          <option value="sponsor">Sponsor</option>
          <option value="manager">Manager</option>
        </select>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="brand" disabled={pending}>
          {pending ? "Sending…" : "Send invite"}
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
