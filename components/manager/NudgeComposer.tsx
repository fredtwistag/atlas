"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Mail, MessageSquare, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { BackLink } from "@/components/ui/BackLink";
import { Textarea, Label, Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";

export function NudgeComposer({
  sprintId,
  name,
  role,
  status,
  sessionsCompleted,
  sessionsTotal,
}: {
  sprintId: string;
  name: string;
  role: string;
  status: string;
  sessionsCompleted: number;
  sessionsTotal: number;
}) {
  const first = name.split(" ")[0];
  const draft = `Hi ${first},\n\nNo pressure at all — just a nudge that your Atlas discovery sessions are open whenever you have a spare five minutes. You're ${sessionsCompleted} of ${sessionsTotal} done, and the last couple are short.\n\nYour take on how things actually run is genuinely useful here. Thanks!`;

  const [channel, setChannel] = useState<"email" | "slack">("email");
  const [subject, setSubject] = useState(
    "A quick nudge on your Atlas sessions",
  );
  const [body, setBody] = useState(draft);
  const [sent, setSent] = useState(false);

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-5">
        <BackLink href={`/sprint/${sprintId}`}>Back to sprint</BackLink>
      </div>

      <div className="mb-6 flex items-center gap-3">
        <Avatar name={name} size="lg" />
        <div>
          <h1 className="font-serif text-2xl font-medium tracking-tight">
            Nudge {name}
          </h1>
          <div className="mt-0.5 flex items-center gap-2 text-sm text-text-2">
            {role}
            <Badge tone={status === "idle" ? "warning" : "neutral"}>
              {sessionsCompleted}/{sessionsTotal} sessions
            </Badge>
          </div>
        </div>
      </div>

      {sent ? (
        <Card className="border-success/40 bg-success-soft p-6 text-center">
          <Check className="mx-auto mb-2 h-7 w-7 text-success" />
          <p className="font-semibold text-success">Nudge sent</p>
          <p className="mt-1 text-md text-text-2">
            Delivered via {channel}. Logged to the audit trail. A 48-hour
            cooldown now applies before another reminder.
          </p>
          <Link
            href={`/sprint/${sprintId}`}
            className="mt-4 inline-block text-[13px] font-medium text-brand hover:text-brand-hover"
          >
            Back to dashboard →
          </Link>
        </Card>
      ) : (
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-1.5 text-xs font-medium text-brand">
            <Sparkles className="h-3.5 w-3.5" />
            Draft written by Atlas — edit anything before sending
          </div>

          <div className="mb-4">
            <Label>Channel</Label>
            <div className="flex gap-2">
              {(
                [
                  ["email", Mail, "Email"],
                  ["slack", MessageSquare, "Slack (v1.5)"],
                ] as const
              ).map(([key, Icon, label]) => (
                <button
                  key={key}
                  onClick={() => key === "email" && setChannel(key)}
                  disabled={key === "slack"}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-[13px] font-medium transition-colors",
                    channel === key
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-border text-text-2 hover:bg-surface-2",
                    key === "slack" && "cursor-not-allowed opacity-50",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {channel === "email" && (
            <div className="mb-4">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
          )}

          <div className="mb-5">
            <Label htmlFor="body">Message</Label>
            <Textarea
              id="body"
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-text-3">
              No quotes or capture content is ever included in a nudge.
            </span>
            <Button variant="brand" onClick={() => setSent(true)}>
              Send nudge
            </Button>
          </div>
        </Card>
      )}
    </main>
  );
}
