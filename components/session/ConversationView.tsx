"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, Check, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { trpc } from "@/lib/trpc/react";
import { captureKindTone } from "@/lib/ui-maps";
import { furthestArc, progressForArc } from "@/lib/session-progress";
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

/** A message turn as returned by session.start (transcript rows carry an arc). */
export interface InitialMessage {
  role: string;
  content: string;
  arc: string | null;
}

export function ConversationView({
  sessionId,
  topicTitle,
  initialMessages,
  onComplete,
}: {
  sessionId: string;
  topicTitle: string;
  initialMessages: InitialMessage[];
  onComplete?: (sessionId: string) => Promise<void>;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>(() =>
    initialMessages
      .filter((m) => m.role === "assistant" || m.role === "user")
      .map((m, i) => ({
        id: `init-${i}`,
        role: m.role as "assistant" | "user",
        content: m.content,
      })),
  );
  const [captures, setCaptures] = useState<LiveCapture[]>([]);
  const [draft, setDraft] = useState("");
  // `arc` tracks the furthest-along arc we've observed, for the honest progress
  // rail. Seeded from the initial transcript; sendMessage doesn't return an arc,
  // so we let `done` drive the final jump to 100%.
  const [arc, setArc] = useState(() =>
    furthestArc(initialMessages.map((m) => m.arc)),
  );
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  const threadRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(false);
  // A monotonic counter for client-generated message ids (avoids key collisions
  // with the init-* ids and with each other across rapid sends).
  const turnRef = useRef(0);

  const sendMessage = trpc.session.sendMessage.useMutation();
  const thinking = sendMessage.isPending;
  const progress = progressForArc(arc, done);

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

    const turn = turnRef.current++;
    // Optimistic user bubble. We keep `text` in scope so we can restore the
    // composer if the turn fails.
    setMessages((m) => [
      ...m,
      { id: `u-${turn}`, role: "user", content: text },
    ]);
    setDraft("");
    setError(null);
    setStatusMessage("Atlas is replying…");

    sendMessage.mutate(
      { id: sessionId, content: text },
      {
        onSuccess: (res) => {
          if (!res) return;
          if (res.captures.length > 0) {
            setCaptures((c) => [
              ...c,
              ...res.captures.map((cap) => ({
                id: cap.id,
                kind: cap.kind,
                summary: cap.summary,
              })),
            ]);
          }
          setMessages((m) => [
            ...m,
            { id: `a-${turn}`, role: "assistant", content: res.assistant },
          ]);
          // The reply belongs to the next arc; nudge the rail forward one step
          // unless we're already at CLOSE. `done` will pin it to 100%.
          setArc((prev) => nextRailArc(prev));
          setStatusMessage(
            res.captures.length > 0
              ? `Reply received. ${res.captures.length} new ${res.captures.length === 1 ? "thing" : "things"} captured.`
              : "Reply received.",
          );
          if (res.done) setDone(true);
        },
        onError: (err) => {
          // Roll the optimistic bubble back out and restore the draft so the IC
          // can retry without retyping.
          setMessages((m) => m.filter((msg) => msg.id !== `u-${turn}`));
          setDraft(text);
          setStatusMessage("");
          // The router maps a missing key to PRECONDITION_FAILED naming
          // ANTHROPIC_API_KEY — surface that verbatim; otherwise a generic,
          // honest retry message.
          setError(
            /ANTHROPIC_API_KEY/i.test(err.message)
              ? err.message
              : "Atlas couldn't reply. Your answer is saved in the box — try again.",
          );
        },
      },
    );
  }

  return (
    <div className="grid h-[calc(100dvh-3.5rem)] grid-cols-1 lg:h-[100dvh] lg:grid-cols-[1fr_300px]">
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
            className="grid h-[44px] w-[44px] place-items-center rounded-md text-text-3 transition-colors hover:bg-surface-2 hover:text-text"
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
                    aria-hidden="true"
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-3"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            )}
            {/* Screen-reader status: send/reply progress, parity with NudgeComposer. */}
            <p role="status" aria-live="polite" className="sr-only">
              {statusMessage}
            </p>
          </div>
        </div>

        {/* Composer — floating rounded input */}
        <div className="px-4 pb-5 pt-2">
          <div className="mx-auto max-w-2xl">
            {done ? (
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-success-soft px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-success">
                  <Check className="h-4 w-4" />
                  Session captured — {captures.length}{" "}
                  {captures.length === 1 ? "thing" : "things"} noted. Thank you.
                </div>
                <Link href="/me">
                  <Button variant="brand" size="sm">
                    Back to my sprint
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                {error && (
                  <div
                    role="alert"
                    className="mb-2 flex items-center justify-between gap-3 rounded-xl bg-danger/10 px-4 py-2.5 text-[13px] text-danger"
                  >
                    <span>{error}</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={send}
                      disabled={!draft.trim() || thinking}
                    >
                      Try again
                    </Button>
                  </div>
                )}
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
                    aria-busy={thinking}
                    className="h-[44px] w-[44px] shrink-0 p-0"
                    aria-label="Send"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                </div>
              </>
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
              {captures.length} captured so far · attributed by name and role
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

/**
 * Advance the progress-rail arc one step on each reply. The engine owns the real
 * arc transitions server-side; this is a client-only estimate that keeps the bar
 * moving forward and stops at CLOSE (the `done` signal pins it to 100%).
 */
function nextRailArc(current: string): ReturnType<typeof furthestArc> {
  const order = [
    "INIT",
    "INTRO",
    "ARC_1",
    "ARC_2",
    "ARC_3",
    "ARC_4",
    "CLOSE",
  ] as const;
  const idx = order.indexOf(current as (typeof order)[number]);
  if (idx === -1) return "CLOSE";
  return order[Math.min(idx + 1, order.length - 1)];
}
