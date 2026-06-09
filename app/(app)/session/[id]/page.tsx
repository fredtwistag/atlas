import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConversationView } from "@/components/session/ConversationView";
import { getApi } from "@/server/trpc/caller";
import { completeSession } from "../actions";

export const metadata: Metadata = { title: "Discovery session · Atlas" };
export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const api = await getApi();
  const session = await api.session.get({ id }).catch(() => null);
  if (!session) notFound();

  return (
    <ConversationView
      sessionId={session.id}
      topicTitle={session.topicTitle}
      onComplete={completeSession}
    />
  );
}
