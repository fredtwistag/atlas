import type { LucideIcon } from "lucide-react";
import { Card } from "./Card";

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-text-3">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="font-serif text-3xl font-medium tracking-tight">
        {value}
      </div>
      {sub ? <div className="mt-1 text-sm text-text-3">{sub}</div> : null}
    </Card>
  );
}
