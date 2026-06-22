import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TranscriptView } from "@/components/session/TranscriptView";
import { getApi } from "@/server/trpc/caller";
import { requireTwistagSession } from "@/lib/auth-guards";

export const metadata: Metadata = { title: "Conversation · Atlas admin" };
export const dynamic = "force-dynamic";

export default async function TwistagTranscript({
  params,
}: {
  params: Promise<{ tenantId: string; sprintId: string; sessionId: string }>;
}) {
  await requireTwistagSession();
  const { tenantId, sprintId, sessionId } = await params;
  const api = await getApi();
  const data = await api.twistag
    .sessionTranscriptView({ sessionId })
    .catch(() => null);
  // Guard: the session must belong to the tenant + sprint in the URL.
  if (!data || data.tenantId !== tenantId || data.sprintId !== sprintId) {
    notFound();
  }

  return (
    <TranscriptView
      transcript={data.transcript}
      backHref={`/admin/clients/${tenantId}/sprint/${sprintId}/report`}
      backLabel="Back to report"
    />
  );
}
