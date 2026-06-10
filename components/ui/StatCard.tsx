import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card } from "./Card";

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  href?: string;
}) {
  const body = (
    <Card
      className={"p-4" + (href ? " transition-colors hover:bg-surface-2" : "")}
    >
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-text-3">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="font-mono text-3xl font-semibold tracking-tight tabular-nums">
        {value}
      </div>
      {sub ? <div className="mt-1 text-sm text-text-3">{sub}</div> : null}
    </Card>
  );

  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
