import Link from "next/link";
import { AlertTriangle, Building2, CircleDot, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { db } from "@/lib/data";
import type { ClientSummary } from "@/lib/types";

const healthMeta: Record<
  ClientSummary["health"],
  { label: string; tone: "success" | "warning" | "danger" }
> = {
  healthy: { label: "Healthy", tone: "success" },
  watch: { label: "Watch", tone: "warning" },
  at_risk: { label: "At risk", tone: "danger" },
};

export default function TwistagCockpit() {
  const clients = db.twistag.clientList();
  const alerts = clients.filter((c) => c.alert);

  const totals = {
    active: clients.length,
    opportunities: clients.reduce((s, c) => s + c.opportunities, 0),
    approved: clients.reduce((s, c) => s + c.approved, 0),
    avgCompletion: Math.round(
      clients.reduce((s, c) => s + c.completionPct, 0) / clients.length,
    ),
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <div className="mb-1 text-sm font-medium text-text-3">
          Twistag · engagement cockpit
        </div>
        <h1 className="font-serif text-3xl font-medium tracking-tight">
          Your clients
        </h1>
        <p className="mt-1.5 text-md text-text-2">
          Every sprint you lead, in one place. Health, momentum, and the
          opportunities heading toward FDE engagements.
        </p>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <Card className="mb-6 border-warning/40 bg-warning-soft">
          <div className="flex items-center gap-2 border-b border-warning/20 px-4 py-2.5 text-sm font-semibold text-warning">
            <AlertTriangle className="h-4 w-4" />
            {alerts.length} client{alerts.length > 1 ? "s" : ""} need attention
          </div>
          <div className="divide-y divide-warning/15">
            {alerts.map((c) => (
              <div
                key={c.tenantId}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="text-sm">
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-text-2"> — {c.alert}</span>
                </div>
                {c.tenantId === "spr-northwind-q2" ? (
                  <Link
                    href={`/sprint/${c.tenantId}`}
                    className="shrink-0 text-[13px] font-medium text-brand hover:text-brand-hover"
                  >
                    Open →
                  </Link>
                ) : (
                  <span className="shrink-0 text-[13px] font-medium text-text-3">
                    Open →
                  </span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Stat strip */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Building2, label: "Active clients", value: totals.active },
          {
            icon: CircleDot,
            label: "Open opportunities",
            value: totals.opportunities,
          },
          {
            icon: TrendingUp,
            label: "Approved for FDE",
            value: totals.approved,
          },
          {
            icon: TrendingUp,
            label: "Avg completion",
            value: `${totals.avgCompletion}%`,
          },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-text-3">
              <s.icon className="h-3.5 w-3.5" />
              {s.label}
            </div>
            <div className="font-serif text-3xl font-medium tracking-tight">
              {s.value}
            </div>
          </Card>
        ))}
      </div>

      {/* Client table */}
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-[0.04em] text-text-3">
              <th className="px-4 py-2.5 font-semibold">Client</th>
              <th className="px-4 py-2.5 font-semibold">Sprint</th>
              <th className="px-4 py-2.5 font-semibold">Health</th>
              <th className="px-4 py-2.5 font-semibold">Completion</th>
              <th className="px-4 py-2.5 text-center font-semibold">Opps</th>
              <th className="px-4 py-2.5 text-center font-semibold">
                Approved
              </th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => {
              const meta = healthMeta[c.health];
              const isLive = c.tenantId === "spr-northwind-q2";
              return (
                <tr
                  key={c.tenantId}
                  className="border-b border-border last:border-0 hover:bg-surface-2"
                >
                  <td className="px-4 py-3">
                    {isLive ? (
                      <Link
                        href={`/sprint/${c.tenantId}`}
                        className="font-medium leading-tight text-brand hover:text-brand-hover"
                      >
                        {c.name}
                      </Link>
                    ) : (
                      <div className="font-medium leading-tight">{c.name}</div>
                    )}
                    <div className="text-xs text-text-3">{c.segment}</div>
                  </td>
                  <td className="px-4 py-3 text-text-2">{c.sprintName}</td>
                  <td className="px-4 py-3">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ProgressBar
                        value={c.completionPct}
                        tone={c.health === "healthy" ? "brand" : "warning"}
                        className="w-24"
                      />
                      <span className="text-xs text-text-3">
                        {c.completionPct}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums">
                    {c.opportunities}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums">
                    {c.approved}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 px-1 text-xs text-text-3">
        Only Northwind Logistics is wired with live data in this demo. The
        others illustrate the multi-client overview.
      </p>
    </main>
  );
}
