"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, Check, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { conversationScript } from "@/lib/data";
import { captureKindTone } from "@/lib/ui-maps";
import type { CaptureKind } from "@/lib/types";

interface ChatMsg {
  id: string;
  role: "assistant" | "user";
  content: string;
}

interface LiveCapture {
  id: string;
  kind: string;
  summary: string;
}

export function ConversationView({
  sessionId,
  topicTitle,
  onComplete,
}: {
  sessionId: string;
  topicTitle: string;
  onComplete?: (sessionId: string) => Promise<void>;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: "m-0", role: "assistant", content: conversationScript[0].assistant },
  ]);
  const [captures, setCaptures] = useState<LiveCapture[]>([]);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [done, setDone] = useState(false);

  const threadRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(false);
  const lastStep = conversationScript.length - 1;
  const progress = Math.round((step / lastStep) * 100);

  useEffect(() => {
    // Guard scrollTo: not implemented in jsdom (tests) and absent in some
    // older browsers.
    threadRef.current?.scrollTo?.({
      top: threadRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, thinking]);

  useEffect(() => {
    if (done && !completedRef.current && onComplete) {
      completedRef.current = true;
      void onComplete(sessionId);
    }
  }, [done, onComplete, sessionId]);

  function send() {
    const text = draft.trim();
    if (!text || thinking || done) return;

    setMessages((m) => [
      ...m,
      { id: `u-${step}`, role: "user", content: text },
    ]);
    setDraft("");
    setThinking(true);

    const nextStep = step + 1;
    // The "extraction pass" runs against the reply and surfaces a capture.
    const incoming = conversationScript[nextStep];

    window.setTimeout(() => {
      setThinking(false);
      if (incoming?.captureOnReply) {
        setCaptures((c) => [
          ...c,
          {
            id: `cap-${nextStep}`,
            kind: incoming.captureOnReply!.kind,
            summary: incoming.captureOnReply!.summary,
          },
        ]);
      }
      if (incoming) {
        setMessages((m) => [
          ...m,
          {
            id: `a-${nextStep}`,
            role: "assistant",
            content: incoming.assistant,
          },
        ]);
        setStep(nextStep);
        if (nextStep >= lastStep) setDone(true);
      }
    }, 900);
  }

  return (
    <div className="grid h-[calc(100vh-3.5rem)] grid-cols-1 lg:h-screen lg:grid-cols-[1fr_300px]">
      {/* Thread — clean, full-height, no card chrome */}
      <div className="flex min-h-0 flex-col">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <div className="text-sm font-semibold">{topicTitle}</div>
            <div className="text-xs text-text-3">
              Atlas discovery session · about 6 minutes
            </div>
          </div>
          <Link
            href="/me"
            className="rounded-md p-1.5 text-text-3 transition-colors hover:bg-surface-2 hover:text-text"
            aria-label="Pause and exit"
          >
            <X className="h-4 w-4" />
          </Link>
        </div>

        <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto px-4">
          <div className="mx-auto max-w-2xl space-y-6 py-6">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "whitespace-pre-wrap text-md leading-relaxed",
                    m.role === "user"
                      ? "max-w-[85%] rounded-2xl bg-surface-2 px-4 py-2.5 text-text"
                      : "max-w-full text-text",
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="flex items-center gap-1 py-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-3"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Composer — floating rounded input */}
        <div className="px-4 pb-5 pt-2">
          <div className="mx-auto max-w-2xl">
            {done ? (
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-success-soft px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-success">
                  <Check className="h-4 w-4" />
                  Session captured — {captures.length} things noted. Thank you.
                </div>
                <Link href="/me">
                  <Button variant="brand" size="sm">
                    Back to my sprint
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 shadow-sm transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={1}
                  aria-label="Your message"
                  placeholder="Type how it really works… (Enter to send)"
                  className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent px-2 py-1.5 text-md leading-relaxed placeholder:text-text-3 focus:outline-none"
                />
                <Button
                  variant="brand"
                  size="md"
                  onClick={send}
                  disabled={!draft.trim() || thinking}
                  className="h-9 w-9 shrink-0 p-0"
                  aria-label="Send"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Capture rail — subtle, divider only (no card) */}
      <aside className="hidden min-h-0 flex-col border-l border-border/60 lg:flex">
        <div className="px-4 py-4">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold">
            <Sparkles className="h-3.5 w-3.5 text-brand" />
            What Atlas is hearing
          </div>
          <div className="mt-2">
            <ProgressBar value={progress} />
            <div className="mt-1.5 text-xs text-text-3">
              {captures.length} captured so far · attributed by role only
            </div>
          </div>
        </div>
        <div
          className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3"
          aria-live="polite"
          aria-label="Captures heard so far"
        >
          {captures.length === 0 ? (
            <p className="px-1 py-4 text-sm leading-relaxed text-text-3">
              As you describe how the work really happens, the moments worth
              acting on will show up here.
            </p>
          ) : (
            captures.map((c) => (
              <div key={c.id} className="rounded-lg bg-surface p-3">
                <Badge
                  tone={captureKindTone[c.kind as CaptureKind] ?? "neutral"}
                  className="mb-1.5"
                >
                  {c.kind}
                </Badge>
                <p className="text-[13px] leading-relaxed text-text">
                  {c.summary}
                </p>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
