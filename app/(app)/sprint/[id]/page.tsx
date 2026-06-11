import type { Metadata } from "next";
import {
  Activity,
  CheckCircle2,
  CircleDot,
  FileText,
  Settings,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { OpportunityCard } from "@/components/opportunity/OpportunityCard";
import { TeamProgress } from "@/components/manager/TeamProgress";
import { PageContainer } from "@/components/ui/PageContainer";
import { notFound } from "next/navigation";
import { getApi } from "@/server/trpc/caller";
import { requireManagerOrSponsor } from "@/lib/auth-guards";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const api = await getApi();
    const sprint = await api.sprint.get({ id });
    return { title: `${sprint.name} · Atlas` };
  } catch {
    return { title: "Sprint · Atlas" };
  }
}

export default async function ManagerDashboard({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireManagerOrSponsor();
  const api = await getApi();

  const sprint = await api.sprint.get({ id }).catch(() => null);
  if (!sprint) notFound();
  const [p, opps, activity] = await Promise.all([
    api.sprint.progress({ id }),
    api.opportunity.listForSprint({ sprintId: id }),
    api.sprint.activity({ id }),
  ]);

  const stats: {
    label: string;
    value: string;
    sub: string;
    icon: typeof Users;
    href?: string;
  }[] = [
    {
      label: "Participation",
      value: `${p.completionPct}%`,
      sub: `${p.sessionsCompleted}/${p.sessionsTotal} sessions complete`,
      icon: Users,
      href: "/team",
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
      href: `/sprint/${id}/report`,
    },
    {
      label: "Signal quality",
      value: `${p.signalQuality}`,
      sub: "sponsor-rated, out of 5",
      icon: FileText,
    },
  ];

  return (
    <PageContainer>
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
            {sprint.status === "completed" ? (
              <Badge tone="neutral">
                <CheckCircle2 className="h-3 w-3" /> Completed
              </Badge>
            ) : (
              <Badge tone="brand">
                <CircleDot className="h-3 w-3" /> Active
              </Badge>
            )}
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
        <div className="flex items-center gap-2">
          <ButtonLink href={`/sprint/${id}/settings`} variant="secondary">
            <Settings className="h-4 w-4" /> Settings
          </ButtonLink>
          <ButtonLink href={`/sprint/${id}/report`} variant="secondary">
            <FileText className="h-4 w-4" /> Preview report
          </ButtonLink>
        </div>
      </div>

      {/* Stat strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <StatCard
            key={s.label}
            icon={s.icon}
            label={s.label}
            value={s.value}
            sub={s.sub}
            href={s.href}
          />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* Left: team progress */}
        <div>
          <h2 className="mb-3 px-1 text-sm font-semibold text-text-2">
            Team progress
          </h2>
          <TeamProgress sprintId={id} participants={sprint.participants} />

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
            {opps.length === 0 ? (
              <Card className="border-dashed p-6 text-center">
                <p className="text-sm font-medium text-text">
                  No opportunities yet
                </p>
                <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-text-3">
                  They surface here as your team&apos;s sessions add up — usually
                  from day 7. Until then, keep an eye on team progress on the
                  left.
                </p>
              </Card>
            ) : (
              opps.map((o) => (
                <OpportunityCard
                  key={o.id}
                  opp={o}
                  href={`/sprint/${id}/opportunity/${o.id}`}
                />
              ))
            )}
          </div>
          <p className="mt-3 px-1 text-xs leading-relaxed text-text-3">
            Opportunities promote from provisional to surfaced after day 7. Weak
            signals (confidence ≤ 2) are hidden by default.
          </p>
        </div>
      </div>
    </PageContainer>
  );
}
