import { notFound } from "next/navigation";
import { EditCaptures } from "@/components/session/EditCaptures";
import { getApi } from "@/server/trpc/caller";
import { requireTenantSession } from "@/lib/auth-guards";

export const dynamic = "force-dynamic";

export default async function EditSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireTenantSession();
  const api = await getApi();
  const view = await api.session.editView({ id }).catch(() => null);
  if (!view) notFound();

  return (
    <EditCaptures
      sessionId={id}
      topicTitle={view.topicTitle}
      completedAt={view.completedAt ?? "—"}
      editWindowEndsAt={view.editWindowEndsAt ?? "—"}
      editable={view.editable}
      captures={view.captures}
    />
  );
}
