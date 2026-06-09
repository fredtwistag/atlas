import { AppHeader } from "@/components/AppHeader";
import { db } from "@/lib/data";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const me = db.me();
  return (
    <div className="min-h-screen bg-bg">
      <AppHeader user={{ name: me.name, title: me.title }} />
      {children}
    </div>
  );
}
