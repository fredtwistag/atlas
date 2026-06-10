import { notFound } from "next/navigation";
import { NudgeComposer } from "@/components/manager/NudgeComposer";
import { getApi } from "@/server/trpc/caller";
import { requireManagerOrSponsor } from "@/lib/auth-guards";

export const dynamic = "force-dynamic";

export default async function NudgePage({
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

  return (
    <NudgeComposer
      sprintId={id}
      name={p.name}
      role={p.title}
      status={p.status}
      sessionsCompleted={p.sessionsCompleted}
      sessionsTotal={p.sessionsTotal}
    />
  );
}
