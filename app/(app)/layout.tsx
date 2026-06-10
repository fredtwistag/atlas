import { AppShell } from "@/components/AppShell";
import { getCurrentUser } from "@/lib/session";
import { getApi } from "@/server/trpc/caller";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getCurrentUser();

  // Sidebar context for tenant users: the current sprint id powers the manager's
  // real nav links; the IC's own sessions power their session checklist. Twistag
  // users have neither; tolerate any read failure.
  let sprintId: string | null = null;
  let icSessions: { id: string; topicTitle: string; status: string }[] = [];
  if (me.kind === "tenant") {
    const api = await getApi();
    const [currentSprint, dashboard] = await Promise.all([
      api.sprint.currentForTenant().catch(() => null),
      api.session.myDashboard().catch(() => null),
    ]);
    sprintId = currentSprint;
    icSessions =
      dashboard?.sessions.map((s) => ({
        id: s.id,
        topicTitle: s.topicTitle,
        status: s.status,
      })) ?? [];
  }

  return (
    <AppShell
      user={{ name: me.name, title: me.title }}
      userKind={me.kind}
      sprintId={sprintId}
      icSessions={icSessions}
    >
      {children}
    </AppShell>
  );
}
