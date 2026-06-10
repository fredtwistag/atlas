import { AppShell } from "@/components/AppShell";
import { getCurrentUser } from "@/lib/session";
import { getApi } from "@/server/trpc/caller";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getCurrentUser();

  // The tenant's current sprint id powers the sidebar's real nav links.
  // Twistag users have no tenant sprint; tolerate any read failure.
  let sprintId: string | null = null;
  if (me.kind === "tenant") {
    const api = await getApi();
    sprintId = await api.sprint.currentForTenant().catch(() => null);
  }

  return (
    <AppShell user={{ name: me.name, title: me.title }} sprintId={sprintId}>
      {children}
    </AppShell>
  );
}
