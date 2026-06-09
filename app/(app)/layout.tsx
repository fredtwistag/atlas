import { AppShell } from "@/components/AppShell";
import { getCurrentUser } from "@/lib/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getCurrentUser();
  return (
    <AppShell user={{ name: me.name, title: me.title }}>{children}</AppShell>
  );
}
