import Link from "next/link";
import {
  ArrowRight,
  Check,
  Clock,
  Lock,
  Pencil,
  ShieldCheck,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ButtonLink } from "@/components/ui/Button";
import { db } from "@/lib/data";

export default function IcHomePage() {
  const me = db.me();
  const sprint = db.sprint.get();
  const sessions = db.session.mine();

  const completed = sessions.filter((s) => s.status === "completed");
  const next = sessions.find((s) => s.status !== "completed");
  const doneCount = completed.length;
  const totalCount = sessions.length;
  const pct = Math.round((doneCount / totalCount) * 100);
  const minutesLeft = sessions
    .filter((s) => s.status !== "completed")
    .reduce((sum, s) => {
      const topic = sprint.topics.find((t) => t.id === s.topicId);
      return sum + (topic?.estMinutes ?? 0);
    }, 0);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      {/* Greeting */}
      <div className="mb-8">
        <div className="mb-1 text-sm font-medium text-text-3">
          {sprint.tenantName} · {sprint.name}
        </div>
        <h1 className="font-serif text-3xl font-medium tracking-tight">
          Welcome back, {me.name.split(" ")[0]}.
        </h1>
        <p className="mt-1.5 text-md text-text-2">
          {doneCount === totalCount
            ? "You're all done — thank you. You can still review and edit anything below."
            : `You're ${doneCount} of ${totalCount} sessions in. About ${minutesLeft} minutes of your time left, whenever it suits you.`}
        </p>
      </div>

      {/* Progress pills */}
      <Card className="mb-6 p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-text-2">Your sprint</span>
          <span className="text-sm text-text-3">
            {doneCount}/{totalCount} complete
          </span>
        </div>
        <ProgressBar value={pct} className="mb-4" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {sprint.topics.map((topic, i) => {
            const session = sessions.find((s) => s.topicId === topic.id);
            const state = session?.status ?? "not_started";
            const isCurrent = session?.id === next?.id;
            return (
              <div
                key={topic.id}
                className="flex items-center gap-2 rounded border border-border bg-bg px-2.5 py-2"
              >
                <span
                  className={
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full " +
                    (state === "completed"
                      ? "bg-success text-white"
                      : isCurrent
                        ? "bg-brand text-white"
                        : "bg-surface-2 text-text-3")
                  }
                >
                  {state === "completed" ? (
                    <Check className="h-3 w-3" />
                  ) : isCurrent ? (
                    <span className="text-[10px] font-semibold">{i + 1}</span>
                  ) : (
                    <Lock className="h-2.5 w-2.5" />
                  )}
                </span>
                <span className="truncate text-[12.5px] font-medium leading-tight">
                  {topic.title}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Next session CTA */}
      {next && (
        <Card className="mb-6 overflow-hidden border-brand/30">
          <div className="bg-brand-soft px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-brand">
                  Up next
                </div>
                <h2 className="font-serif text-2xl font-medium tracking-tight">
                  {sprint.topics.find((t) => t.id === next.topicId)?.title}
                </h2>
                <p className="mt-1.5 max-w-md text-md text-text-2">
                  {sprint.topics.find((t) => t.id === next.topicId)?.description}
                </p>
                <div className="mt-3 flex items-center gap-1.5 text-sm text-text-2">
                  <Clock className="h-3.5 w-3.5" />
                  About{" "}
                  {sprint.topics.find((t) => t.id === next.topicId)?.estMinutes}{" "}
                  minutes
                </div>
              </div>
            </div>
            <ButtonLink
              href={`/session/${next.id}`}
              variant="brand"
              size="lg"
              className="mt-5"
            >
              Start session <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </div>
        </Card>
      )}

      {/* Completed sessions */}
      {completed.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-3 px-1 text-sm font-semibold text-text-2">
            Completed
          </h3>
          <div className="space-y-2">
            {completed.map((s) => (
              <Card
                key={s.id}
                className="flex items-center justify-between gap-4 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{s.topicTitle}</span>
                    <Badge tone="success">
                      <Check className="h-3 w-3" /> Done
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-sm text-text-3">
                    {s.completedAt} · {s.captureCount} things captured ·{" "}
                    {Math.round((s.totalSeconds ?? 0) / 60)} min
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="hidden text-xs text-text-3 sm:inline">
                    Editable until {s.editWindowEndsAt}
                  </span>
                  <Link
                    href={`/me/sessions/${s.id}/edit`}
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:text-brand-hover"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Review &amp; edit
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Privacy reassurance */}
      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        <p>
          What you say is attributed by <strong>role, never by name</strong>, in
          anything your manager or sponsor sees. You can edit or remove anything
          you said for 7 days after each session.
        </p>
      </div>
    </main>
  );
}
