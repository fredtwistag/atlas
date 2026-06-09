import { AppHeader } from "@/components/AppHeader";
import { getCurrentUser } from "@/lib/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getCurrentUser();
  return (
    <div className="min-h-screen bg-bg">
      <AppHeader user={{ name: me.name, title: me.title }} />
      {children}
    </div>
  );
}
