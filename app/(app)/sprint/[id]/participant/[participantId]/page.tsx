import { notFound } from "next/navigation";
import { Check, Clock } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { BackLink } from "@/components/ui/BackLink";
import { NudgeComposer } from "@/components/manager/NudgeComposer";
import { getApi } from "@/server/trpc/caller";
import { requireManagerOrSponsor } from "@/lib/auth-guards";
import { participantStatusMeta } from "@/lib/ui-maps";
import type { ParticipantStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ParticipantPage({
  params,
}: {
  params: Promise<{ id: string; participantId: string }>;
}) {
  const { id, participantId } = await params;
  await requireManagerOrSponsor();
  const api = await getApi();
  const p = await api.sprint
    .participant({ sprintId: id, userId: participantId })
    .catch(() => null);
  if (!p) notFound();

  const meta = participantStatusMeta[p.status as ParticipantStatus];

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <BackLink href={`/sprint/${id}`}>Back to sprint</BackLink>

      <div className="mb-6 mt-4 flex items-center gap-3">
        <Avatar name={p.name} size="lg" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-text-2">
            <span>{p.title}</span>
            {meta ? <Badge tone={meta.tone}>{meta.label}</Badge> : null}
            <span className="text-text-3">·</span>
            <span className="text-text-3">
              {p.sessionsCompleted}/{p.sessionsTotal} sessions
            </span>
            {p.lastActiveLabel ? (
              <>
                <span className="text-text-3">·</span>
                <span className="text-text-3">{p.lastActiveLabel}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-text-2">Sessions</h2>
          <Card className="divide-y divide-border">
            {p.sessions.length === 0 ? (
              <div className="px-4 py-4 text-sm text-text-3">
                No sessions yet.
              </div>
            ) : (
              p.sessions.map((s, i) => {
                const done = s.status === "completed";
                return (
                  <div
                    key={`${s.topicTitle}-${i}`}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <span
                      className={
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full " +
                        (done
                          ? "bg-success text-white"
                          : "bg-surface-2 text-text-3")
                      }
                    >
                      {done ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Clock className="h-3 w-3" />
                      )}
                    </span>
                    <span className="flex-1 text-sm font-medium">
                      {s.topicTitle}
                    </span>
                    <span className="text-xs text-text-3">
                      {done ? "Completed" : "Pending"}
                    </span>
                  </div>
                );
              })
            )}
          </Card>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold text-text-2">Nudge</h2>
          <NudgeComposer
            sprintId={id}
            name={p.name}
            role={p.title}
            status={p.status}
            sessionsCompleted={p.sessionsCompleted}
            sessionsTotal={p.sessionsTotal}
          />
        </div>
      </div>
    </main>
  );
}
