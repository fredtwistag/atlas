import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  CircleDot,
  FileText,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Avatar } from "@/components/ui/Avatar";
import { ButtonLink } from "@/components/ui/Button";
import { ScoreBadge } from "@/components/ScoreBadge";
import { db, usdRange } from "@/lib/data";
import { participantStatusMeta } from "@/lib/ui-maps";

export default async function ManagerDashboard({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sprint = db.sprint.get(id);
  const p = db.sprint.progress(id);
  const opps = db.opportunity.listForSprint(id);
  const activity = db.sprint.activity();

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
    <main className="mx-auto max-w-7xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm text-text-3">
            {sprint.tenantName} · {sprint.tenantSegment}
          </div>
          <h1 className="font-serif text-3xl font-medium tracking-tight">
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
          <Card key={s.label} className="p-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-text-3">
              <s.icon className="h-3.5 w-3.5" />
              {s.label}
            </div>
            <div className="font-serif text-3xl font-medium tracking-tight">
              {s.value}
            </div>
            <div className="mt-1 text-sm text-text-3">{s.sub}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* Left: team progress */}
        <div>
          <h2 className="mb-3 px-1 text-sm font-semibold text-text-2">
            Team progress
          </h2>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-[0.04em] text-text-3">
                  <th className="px-4 py-2.5 font-semibold">Contributor</th>
                  <th className="px-4 py-2.5 font-semibold">Progress</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">
                    Last active
                  </th>
                </tr>
              </thead>
              <tbody>
                {sprint.participants.map((pt) => {
                  const meta = participantStatusMeta[pt.status];
                  const pct = Math.round(
                    (pt.sessionsCompleted / pt.sessionsTotal) * 100,
                  );
                  return (
                    <tr
                      key={pt.user.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-4 py-3">
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
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ProgressBar
                            value={pct}
                            tone={pt.status === "idle" ? "warning" : "brand"}
                            className="w-20"
                          />
                          <span className="text-xs text-text-3">
                            {pt.sessionsCompleted}/{pt.sessionsTotal}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-text-3">
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
              <Link key={o.id} href={`/sprint/${id}/opportunity/${o.id}`}>
                <Card className="group p-4 transition-all hover:border-border-strong hover:shadow">
                  <div className="flex items-start justify-between gap-3">
                    <ScoreBadge score={o.compositeScore} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-md font-semibold leading-snug">
                          {o.title}
                        </h3>
                        <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-text-3 transition-colors group-hover:text-brand" />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge tone="success">
                          {usdRange(o.impactLow, o.impactHigh)}/yr
                        </Badge>
                        <Badge tone="outline">
                          {o.timeToShipWeeksLow}–{o.timeToShipWeeksHigh} wks
                        </Badge>
                        <Badge tone="neutral">
                          {o.contributorCount} voices
                        </Badge>
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
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
