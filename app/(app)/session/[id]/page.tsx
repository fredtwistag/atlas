import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ConversationView } from "@/components/session/ConversationView";
import { getApi } from "@/server/trpc/caller";
import { requireTenantSession } from "@/lib/auth-guards";
import { hasAckedPrivacy } from "@/lib/privacy";
import { completeSession } from "../actions";

export const metadata: Metadata = { title: "Discovery session · Atlas" };
export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Privacy gate (PRD F1.5): an IC can't open a session before acknowledging.
  const claims = await requireTenantSession();
  if (claims.role === "ic" && !(await hasAckedPrivacy(claims))) {
    redirect("/me");
  }

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
