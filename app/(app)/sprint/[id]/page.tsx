import type { Metadata } from "next";
import Link from "next/link";
import { Activity, CircleDot, FileText, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Avatar } from "@/components/ui/Avatar";
import { ButtonLink } from "@/components/ui/Button";
import { OpportunityCard } from "@/components/opportunity/OpportunityCard";
import { Table, THead, Th, HeaderRow, Tr, Td } from "@/components/ui/Table";
import { db } from "@/lib/data";
import { participantStatusMeta } from "@/lib/ui-maps";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const sprint = await db.sprint.get(id);
  return { title: `${sprint.name} · Atlas` };
}

export default async function ManagerDashboard({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sprint = await db.sprint.get(id);
  const p = await db.sprint.progress(id);
  const opps = await db.opportunity.listForSprint(id);
  const activity = await db.sprint.activity();

  const stats = [
    {
      label: "Participation",
      value: `${p.completionPct}%`,
      sub: `${p.sessionsCompleted}/${p.sessionsTotal} sessions complete`,
      icon: Users,
    },
    {
      label: "Weekly active",
      value: `${p.weeklyActiveContributors}/${p.participantCount}`,
      sub: "contributors this week",
      icon: Activity,
    },
    {
      label: "Opportunities",
      value: `${p.opportunitiesCount}`,
      sub: `${p.highImpactCount} high-impact · ${p.capturesCount} captures`,
      icon: CircleDot,
    },
    {
      label: "Signal quality",
      value: `${p.signalQuality}`,
      sub: "sponsor-rated, out of 5",
      icon: FileText,
    },
  ];

  return (
    <main className="w-full px-6 py-8 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm text-text-3">
            {sprint.tenantName} · {sprint.tenantSegment}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {sprint.name}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-text-2">
            <Badge tone="brand">
              <CircleDot className="h-3 w-3" /> Active
            </Badge>
            <span>
              Day {sprint.dayOf} of {sprint.dayTotal}
            </span>
            <span className="text-text-3">·</span>
            <span>
              {sprint.startDate} – {sprint.endDate}
            </span>
            <span className="text-text-3">·</span>
            <span>{sprint.primaryFocus}</span>
          </div>
        </div>
        <ButtonLink href={`/sprint/${id}/report`} variant="secondary">
          <FileText className="h-4 w-4" /> Preview report
        </ButtonLink>
      </div>

      {/* Stat strip */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <StatCard
            key={s.label}
            icon={s.icon}
            label={s.label}
            value={s.value}
            sub={s.sub}
          />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* Left: team progress */}
        <div>
          <h2 className="mb-3 px-1 text-sm font-semibold text-text-2">
            Team progress
          </h2>
          <Card className="overflow-hidden">
            <Table>
              <THead>
                <HeaderRow>
                  <Th>Contributor</Th>
                  <Th>Progress</Th>
                  <Th>Status</Th>
                  <Th align="right">Last active</Th>
                </HeaderRow>
              </THead>
              <tbody>
                {sprint.participants.map((pt) => {
                  const meta = participantStatusMeta[pt.status];
                  const pct = Math.round(
                    (pt.sessionsCompleted / pt.sessionsTotal) * 100,
                  );
                  return (
                    <Tr key={pt.user.id} hover={false}>
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={pt.user.name} size="sm" />
                          <div className="min-w-0">
                            <div className="font-medium leading-tight">
                              {pt.user.name}
                            </div>
                            <div className="text-xs text-text-3">
                              {pt.user.department}
                            </div>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <ProgressBar
                            value={pct}
                            tone={pt.status === "idle" ? "warning" : "brand"}
                            className="w-20"
                          />
                          <span className="font-mono text-xs tabular-nums text-text-3">
                            {pt.sessionsCompleted}/{pt.sessionsTotal}
                          </span>
                        </div>
                      </Td>
                      <Td>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </Td>
                      <Td align="right" className="text-xs text-text-3">
                        {pt.status === "idle" || pt.status === "not_started" ? (
                          <Link
                            href={`/sprint/${id}/nudge/${pt.user.id}`}
                            className="font-medium text-brand hover:text-brand-hover"
                          >
                            Send nudge →
                          </Link>
                        ) : (
                          pt.lastActiveLabel
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>

          {/* Activity feed */}
          <h2 className="mb-3 mt-6 px-1 text-sm font-semibold text-text-2">
            Recent activity
          </h2>
          <Card className="divide-y divide-border">
            {activity.map((a) => (
              <div key={a.id} className="flex items-start gap-3 px-4 py-3">
                <span
                  className={
                    "mt-1 h-2 w-2 shrink-0 rounded-full " +
                    (a.kind === "opportunity_surfaced"
                      ? "bg-brand"
                      : a.kind === "nudge_sent"
                        ? "bg-warning"
                        : "bg-success")
                  }
                />
                <div className="flex-1 text-[13px] leading-snug text-text-2">
                  {a.label}
                </div>
                <span className="shrink-0 text-xs text-text-3">
                  {a.timeLabel}
                </span>
              </div>
            ))}
          </Card>
        </div>

        {/* Right: opportunities */}
        <div>
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-text-2">
              Opportunities surfacing
            </h2>
            <span className="text-xs text-text-3">
              ranked by composite score
            </span>
          </div>
          <div className="space-y-2.5">
            {opps.map((o) => (
              <OpportunityCard
                key={o.id}
                opp={o}
                href={`/sprint/${id}/opportunity/${o.id}`}
              />
            ))}
          </div>
          <p className="mt-3 px-1 text-xs leading-relaxed text-text-3">
            Opportunities promote from provisional to surfaced after day 7. Weak
            signals (confidence ≤ 2) are hidden by default.
          </p>
        </div>
      </div>
    </main>
  );
}
