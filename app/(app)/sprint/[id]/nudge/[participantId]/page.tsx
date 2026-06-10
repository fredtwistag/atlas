import { redirect } from "next/navigation";

export default async function NudgeRedirect({
  params,
}: {
  params: Promise<{ id: string; participantId: string }>;
}) {
  const { id, participantId } = await params;
  redirect(`/sprint/${id}/participant/${participantId}`);
}
