import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConversationView } from "@/components/session/ConversationView";
import { db } from "@/lib/data";

export const metadata: Metadata = { title: "Discovery session · Atlas" };

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await db.session.get(id);
  const sprint = await db.sprint.get();
  // The demo's interactive script is anchored on the "One change" / next topic;
  // fall back to a sensible title if the id isn't one of the seeded sessions.
  const topicTitle =
    session?.topicTitle ?? sprint.topics[0]?.title ?? "Discovery session";

  if (!id) notFound();

  return <ConversationView sessionId={id} topicTitle={topicTitle} />;
}
