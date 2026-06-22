import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleDot, FileText, Sparkles, Users } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { BackLink } from "@/components/ui/BackLink";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ScoreBadge } from "@/components/ScoreBadge";
import { getApi } from "@/server/trpc/caller";
import { requireTwistagSession } from "@/lib/auth-guards";
import type { OpportunityStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const statusTone = (s: OpportunityStatus): "success" | "brand" | "neutral" =>
  s === "approved" ? "success" : s === "surfaced" ? "brand" : "neutral";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sprintId: string }>;
}): Promise<Metadata> {
  const { sprintId } = await params;
  try {
    const api = await getApi();
    const data = await api.twistag.sprintView({ sprintId });
    return { title: `${data.sprint.name} · Atlas admin` };
  } catch {
    return { title: "Sprint · Atlas admin" };
  }
}

export default async function TwistagSprint({
  params,
}: {
  params: Promise<{ tenantId: string; sprintId: string }>;
}) {
  await requireTwistagSession();
  const { tenantId, sprintId } = await params;
  const api = await getApi();
  const data = await api.twistag.sprintView({ sprintId }).catch(() => null);
  // Guard: the sprint must belong to the tenant in the URL.
  if (!data || data.tenantId !== tenantId) notFound();
  const { sprint, progress, opportunities } = data;
  const base = `/admin/clients/${tenantId}/sprint/${sprintId}`;

  return (
    <PageContainer>
      <div className="mb-5">
        <BackLink href={`/admin/clients/${tenantId}`}>Back to client</BackLink>
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone={sprint.status === "completed" ? "neutral" : "brand"}>
              {sprint.status}
            </Badge>
            <span className="text-xs text-text-3">
              {sprint.tenantName} · {fmtDate(sprint.startDate)} –{" "}
              {fmtDate(sprint.endDate)}
            </span>
          </div>
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
            {sprint.name}
          </h1>
        </div>
        <Link
          href={`${base}/report`}
          className="inline-flex h-[44px] shrink-0 items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-medium text-surface hover:bg-brand-hover"
        >
          <FileText className="h-4 w-4" /> Open report
        </Link>
      </div>

      {/* Stats */}
      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={CircleDot}
          label="Progress"
          value={`${progress.completionPct}%`}
          sub={<ProgressBar value={progress.completionPct} className="mt-2" />}
        />
        <StatCard
          icon={Users}
          label="Participants"
          value={progress.participantCount}
        />
        <StatCard
          icon={CircleDot}
          label="Sessions"
          value={`${progress.sessionsCompleted}/${progress.sessionsTotal}`}
        />
        <StatCard
          icon={Sparkles}
          label="Opportunities"
          value={opportunities.length}
        />
      </div>

      {/* Opportunities */}
      <h2 className="mb-3 text-sm font-semibold">Opportunities</h2>
      {opportunities.length === 0 ? (
        <Card className="p-6 text-sm text-text-3">
          No opportunities yet. Run “Recompute” on this sprint once its sessions
          are complete, and they&apos;ll appear here ranked by composite score.
        </Card>
      ) : (
        <div className="space-y-2">
          {opportunities.map((o) => (
            <Link
              key={o.id}
              href={`${base}/opportunity/${o.id}`}
              className="block"
            >
              <Card className="flex items-center justify-between gap-3 p-4 transition-colors hover:border-border-strong">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge tone={statusTone(o.status)}>{o.status}</Badge>
                    <span className="truncate font-medium">{o.title}</span>
                  </div>
                  <div className="mt-1 text-xs text-text-3">{o.category}</div>
                </div>
                <ScoreBadge score={o.compositeScore} />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
