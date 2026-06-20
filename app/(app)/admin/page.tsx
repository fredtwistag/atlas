import Link from "next/link";
import { AlertTriangle, Building2, CircleDot, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Table, THead, Th, HeaderRow, Tr, Td } from "@/components/ui/Table";
import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import { getApi } from "@/server/trpc/caller";
import { clientHealthMeta } from "@/lib/ui-maps";
import { requireTwistagSession } from "@/lib/auth-guards";

export const metadata: Metadata = { title: "Clients · Atlas" };
export const dynamic = "force-dynamic";

export default async function AdminCockpit() {
  await requireTwistagSession();
  const api = await getApi();
  const clients = await api.twistag.clientList();
  const alerts = clients.filter((c) => c.alert);

  const totals = {
    active: clients.length,
    opportunities: clients.reduce((s, c) => s + c.opportunities, 0),
    approved: clients.reduce((s, c) => s + c.approved, 0),
    avgCompletion: clients.length
      ? Math.round(
          clients.reduce((s, c) => s + c.completionPct, 0) / clients.length,
        )
      : 0,
  };

  return (
    <PageContainer>
      <div className="mb-6">
        <div className="mb-1 text-sm font-medium text-text-3">
          Twistag · engagement cockpit
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Your clients</h1>
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
                  <Link
                    href={`/admin/clients/${c.tenantId}`}
                    className="font-semibold hover:underline"
                  >
                    {c.name}
                  </Link>
                  <span className="text-text-2"> — {c.alert}</span>
                </div>
                <span className="shrink-0 text-[13px] font-medium text-text-3">
                  Needs attention
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Stat strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
          <StatCard
            key={s.label}
            icon={s.icon}
            label={s.label}
            value={s.value}
          />
        ))}
      </div>

      {/* Client table */}
      {clients.length === 0 ? (
        <Card className="border-dashed bg-transparent">
          <div className="px-6 py-12 text-center">
            <Building2 className="mx-auto h-7 w-7 text-text-3" />
            <h2 className="mt-3 text-md font-semibold">No clients yet</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-text-2">
              Every company you onboard lands here with live sprint health and
              momentum. Invite your first client to get started.
            </p>
            <ButtonLink
              href="/admin/clients/new"
              variant="primary"
              className="mt-4"
            >
              Invite a client
            </ButtonLink>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <HeaderRow>
                <Th>Client</Th>
                <Th>Sprint</Th>
                <Th>Health</Th>
                <Th>Completion</Th>
                <Th align="center">Opps</Th>
                <Th align="center">Approved</Th>
              </HeaderRow>
            </THead>
            <tbody>
              {clients.map((c) => {
                const meta = clientHealthMeta[c.health];
                return (
                  <Tr key={c.tenantId}>
                    <Td>
                      <Link
                        href={`/admin/clients/${c.tenantId}`}
                        className="font-medium leading-tight hover:text-brand hover:underline"
                      >
                        {c.name}
                      </Link>
                      <div className="text-xs text-text-3">{c.segment}</div>
                    </Td>
                    <Td className="text-text-2">
                      {c.sprintId ? (
                        <Link
                          href={`/admin/clients/${c.tenantId}/sprint/${c.sprintId}/report`}
                          className="hover:text-brand hover:underline"
                        >
                          {c.sprintName}
                        </Link>
                      ) : (
                        c.sprintName
                      )}
                    </Td>
                    <Td>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <ProgressBar
                          value={c.completionPct}
                          tone={c.health === "healthy" ? "brand" : "warning"}
                          className="w-24"
                        />
                        <span className="font-mono text-xs tabular-nums text-text-3">
                          {c.completionPct}%
                        </span>
                      </div>
                    </Td>
                    <Td align="center" className="font-mono tabular-nums">
                      {c.opportunities}
                    </Td>
                    <Td align="center" className="font-mono tabular-nums">
                      {c.approved}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
      {clients.length > 0 && (
        <p className="mt-3 px-1 text-xs text-text-3">
          Live across every client you lead. Health and completion update as
          participants finish their sessions.
        </p>
      )}
    </PageContainer>
  );
}
