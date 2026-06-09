import { notFound } from "next/navigation";
import { NudgeComposer } from "@/components/manager/NudgeComposer";
import { db } from "@/lib/data";

export default async function NudgePage({
  params,
}: {
  params: Promise<{ id: string; participantId: string }>;
}) {
  const { id, participantId } = await params;
  const sprint = db.sprint.get(id);
  const participant = sprint.participants.find(
    (p) => p.user.id === participantId,
  );
  if (!participant) notFound();

  return (
    <NudgeComposer
      sprintId={id}
      name={participant.user.name}
      role={participant.user.title}
      status={participant.status}
      sessionsCompleted={participant.sessionsCompleted}
      sessionsTotal={participant.sessionsTotal}
    />
  );
}
