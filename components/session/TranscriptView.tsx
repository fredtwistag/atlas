import { Badge } from "@/components/ui/Badge";
import { BackLink } from "@/components/ui/BackLink";
import { PageContainer } from "@/components/ui/PageContainer";
import { cn } from "@/lib/cn";
import type { SessionTranscript } from "@/lib/types";

/**
 * Read-only conversation transcript for the Twistag admin — the full
 * Atlas↔contributor exchange behind an opportunity's evidence. Presentational
 * only (no composer, no mutations); the bubble styling mirrors ConversationView.
 */
export function TranscriptView({
  transcript,
  backHref,
  backLabel = "Back to report",
}: {
  transcript: SessionTranscript;
  backHref: string;
  backLabel?: string;
}) {
  return (
    <PageContainer>
      <div className="mb-5">
        <BackLink href={backHref}>{backLabel}</BackLink>
      </div>

      <div className="mb-6">
        <div className="mb-1 text-xs font-semibold uppercase tracking-[0.06em] text-text-3">
          Conversation transcript
        </div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
          {transcript.topicTitle}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-text-2">
          <span className="font-medium">{transcript.contributorName}</span>
          <span className="text-text-3">· {transcript.contributorRole}</span>
          <Badge tone="neutral">{transcript.status}</Badge>
          {transcript.completedAt ? (
            <span className="text-text-3">
              Completed {transcript.completedAt}
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-text-3">
          Read-only Twistag view. Contributor identity is shown for Twistag
          debugging and is never surfaced to the client&apos;s manager.
        </p>
      </div>

      {transcript.messages.length === 0 ? (
        <p className="rounded border border-dashed border-border px-4 py-10 text-center text-sm text-text-3">
          No messages recorded for this session.
        </p>
      ) : (
        <div className="mx-auto max-w-2xl space-y-6">
          {transcript.messages.map((m) => (
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
        </div>
      )}
    </PageContainer>
  );
}
