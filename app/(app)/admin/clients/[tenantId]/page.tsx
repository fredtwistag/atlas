import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleDot, FileText, Users } from "lucide-react";
import { CompanyLogo } from "@/components/CompanyLogo";
import { PageContainer } from "@/components/ui/PageContainer";
import { BackLink } from "@/components/ui/BackLink";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Table, THead, Th, HeaderRow, Tr, Td } from "@/components/ui/Table";
import { MemberRow } from "@/components/manager/MemberRow";
import { PendingInviteRow } from "@/components/manager/PendingInviteRow";
import { ClientTabs } from "@/components/admin/ClientTabs";
import { CompanyEditForm } from "@/components/admin/CompanyEditForm";
import { CompanyContextPanel } from "@/components/admin/CompanyContextPanel";
import { InviteMemberForm } from "@/components/admin/InviteMemberForm";
import { CloseSprintButton } from "@/components/admin/CloseSprintButton";
import { RecomputeButton } from "@/components/admin/RecomputeButton";
import { OpportunityCurationCard } from "@/components/admin/OpportunityCurationCard";
import { tenantStatusMeta } from "@/lib/ui-maps";
import { getApi } from "@/server/trpc/caller";
import { requireTwistagSession } from "@/lib/auth-guards";
import {
  updateTenantAction,
  inviteMemberAction,
  updateMemberRoleAction,
  removeMemberAction,
  resendInviteAction,
  cancelInviteAction,
  closeSprintAction,
  recomputeOpportunitiesAction,
  updateOpportunityAction,
  setOpportunityStatusAction,
  enrichCompanyAction,
  approveCompanyContextAction,
  discardCompanyContextAction,
  ingestDocumentAction,
} from "./actions";

export const metadata: Metadata = { title: "Client · Atlas admin" };
export const dynamic = "force-dynamic";

const fmtDate = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

const fmtAt = (d: Date | string) =>
  new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  await requireTwistagSession();
  const { tenantId } = await params;
  const api = await getApi();
  const data = await api.twistag.clientDetail({ tenantId }).catch(() => null);
  if (!data) notFound();
  const { tenant, members, pendingInvitations, sprints, opportunities } = data;
  const activity = await api.twistag
    .auditLog({ tenantId, includeReads: false, limit: 20 })
    .catch(() => ({ rows: [], nextCursor: null }));
  const companyContext = await api.twistag
    .companyContext({ tenantId })
    .catch(() => null);

  const statusMeta = tenantStatusMeta[tenant.status] ?? {
    label: tenant.status,
    tone: "neutral" as const,
  };
  const sprintName = (id: string) =>
    sprints.find((s) => s.id === id)?.name ?? "Sprint";

  // Server actions bound to this tenant.
  const onUpdateTenant = updateTenantAction.bind(null, tenantId);
  const onInvite = inviteMemberAction.bind(null, tenantId);
  const onUpdateRole = updateMemberRoleAction.bind(null, tenantId);
  const onRemove = removeMemberAction.bind(null, tenantId);
  const onResend = resendInviteAction.bind(null, tenantId);
  const onCancel = cancelInviteAction.bind(null, tenantId);
  const onUpdateOpp = updateOpportunityAction.bind(null, tenantId);
  const onSetOppStatus = setOpportunityStatusAction.bind(null, tenantId);
  const onEnrich = enrichCompanyAction.bind(null, tenantId);
  const onApproveContext = approveCompanyContextAction.bind(null, tenantId);
  const onDiscardContext = discardCompanyContextAction.bind(null, tenantId);
  const onIngestDoc = ingestDocumentAction.bind(null, tenantId);

  const tabs = [
    {
      id: "overview",
      label: "Overview",
      content: (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={FileText} label="Sprints" value={sprints.length} />
            <StatCard icon={Users} label="Members" value={members.length} />
            <StatCard
              icon={Users}
              label="Pending invites"
              value={pendingInvitations.length}
            />
            <StatCard
              icon={CircleDot}
              label="Opportunities"
              value={opportunities.length}
            />
          </div>
          <Card className="p-5">
            <h2 className="mb-3 text-md font-semibold">Company</h2>
            <CompanyEditForm
              initial={{
                name: tenant.name,
                segment: tenant.segment,
                status: tenant.status,
                domain: tenant.domain ?? "",
                currency: tenant.currency,
              }}
              action={onUpdateTenant}
            />
          </Card>
        </div>
      ),
    },
    {
      id: "context",
      label: "Context",
      content: (
        <Card className="p-5">
          <h2 className="mb-1 text-md font-semibold">Company context</h2>
          <p className="mb-4 text-sm text-text-3">
            Seed what Atlas knows about this company. Enrichment and ingested
            docs land as a draft; approve it to start steering IC prompts and
            scoring.
          </p>
          <CompanyContextPanel
            context={
              companyContext
                ? {
                    status: companyContext.status,
                    summary: companyContext.summary,
                    industry: companyContext.industry,
                    businessModel: companyContext.businessModel,
                    sizeBand: companyContext.sizeBand,
                    revenueBand: companyContext.revenueBand,
                    maturity: companyContext.maturity,
                    keySystems: companyContext.keySystems ?? [],
                    knownPains: companyContext.knownPains ?? [],
                    sources: companyContext.sources,
                    enrichedBy: companyContext.enrichedBy,
                  }
                : null
            }
            onEnrich={onEnrich}
            onIngest={onIngestDoc}
            onApprove={onApproveContext}
            onDiscard={onDiscardContext}
          />
        </Card>
      ),
    },
    {
      id: "sprints",
      label: "Sprints",
      content:
        sprints.length === 0 ? (
          <EmptyState>
            No sprints yet. They appear here once this client&apos;s manager
            launches their first discovery sprint.
          </EmptyState>
        ) : (
          <>
            {/* Desktop table */}
            <Card className="hidden overflow-hidden md:block">
              <Table>
                <THead>
                  <HeaderRow>
                    <Th>Sprint</Th>
                    <Th>Status</Th>
                    <Th>Completion</Th>
                    <Th align="center">People</Th>
                    <Th align="center">Opps</Th>
                    <Th align="right">Actions</Th>
                  </HeaderRow>
                </THead>
                <tbody>
                  {sprints.map((s) => (
                    <Tr key={s.id}>
                      <Td>
                        <Link
                          href={`/admin/clients/${tenantId}/sprint/${s.id}/report`}
                          className="font-medium leading-tight hover:text-brand hover:underline"
                        >
                          {s.name}
                        </Link>
                        <div className="text-xs text-text-3">
                          {fmtDate(s.startDate)} – {fmtDate(s.endDate)}
                        </div>
                      </Td>
                      <Td>
                        <Badge
                          tone={s.status === "completed" ? "neutral" : "brand"}
                        >
                          {s.status}
                        </Badge>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <ProgressBar
                            value={s.completionPct}
                            className="w-20"
                          />
                          <span className="font-mono text-xs tabular-nums text-text-3">
                            {s.completionPct}%
                          </span>
                        </div>
                      </Td>
                      <Td align="center" className="font-mono tabular-nums">
                        {s.participantCount}
                      </Td>
                      <Td align="center" className="font-mono tabular-nums">
                        {s.opportunityCount}
                      </Td>
                      <Td align="right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/admin/clients/${tenantId}/sprint/${s.id}/report`}
                            className="text-[13px] font-medium text-brand hover:underline"
                          >
                            Report
                          </Link>
                          <RecomputeButton
                            action={recomputeOpportunitiesAction.bind(
                              null,
                              tenantId,
                              s.id,
                            )}
                            label="Recompute"
                          />
                          {s.status !== "completed" ? (
                            <CloseSprintButton
                              sprintName={s.name}
                              action={closeSprintAction.bind(
                                null,
                                tenantId,
                                s.id,
                              )}
                            />
                          ) : null}
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>

            {/* Mobile cards */}
            <div className="space-y-2 md:hidden">
              {sprints.map((s) => (
                <Card key={s.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/admin/clients/${tenantId}/sprint/${s.id}/report`}
                        className="font-medium leading-tight hover:text-brand hover:underline"
                      >
                        {s.name}
                      </Link>
                      <div className="text-xs text-text-3">
                        {fmtDate(s.startDate)} – {fmtDate(s.endDate)}
                      </div>
                    </div>
                    <Badge
                      tone={s.status === "completed" ? "neutral" : "brand"}
                    >
                      {s.status}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <ProgressBar value={s.completionPct} className="flex-1" />
                    <span className="font-mono text-xs tabular-nums text-text-3">
                      {s.completionPct}%
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-text-3">
                      {s.participantCount} people · {s.opportunityCount} opps
                    </span>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/clients/${tenantId}/sprint/${s.id}/report`}
                        className="text-[13px] font-medium text-brand hover:underline"
                      >
                        Report
                      </Link>
                      <RecomputeButton
                        action={recomputeOpportunitiesAction.bind(
                          null,
                          tenantId,
                          s.id,
                        )}
                        label="Recompute"
                      />
                      {s.status !== "completed" ? (
                        <CloseSprintButton
                          sprintName={s.name}
                          action={closeSprintAction.bind(null, tenantId, s.id)}
                        />
                      ) : null}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </>
        ),
    },
    {
      id: "people",
      label: "People",
      content: (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div>
            <h2 className="mb-3 text-sm font-semibold text-text-2">
              {members.length} member{members.length === 1 ? "" : "s"}
            </h2>
            <div className="space-y-2">
              {members.map((m) => (
                <MemberRow
                  key={m.id}
                  id={m.id}
                  name={m.name}
                  email={m.email}
                  role={m.role}
                  isSelf={false}
                  canManage
                  onUpdateRole={onUpdateRole}
                  onRemove={onRemove}
                />
              ))}
            </div>

            {pendingInvitations.length > 0 && (
              <>
                <h2 className="mb-3 mt-6 text-sm font-semibold text-text-2">
                  {pendingInvitations.length} pending invitation
                  {pendingInvitations.length === 1 ? "" : "s"}
                </h2>
                <div className="space-y-2">
                  {pendingInvitations.map((i) => (
                    <PendingInviteRow
                      key={i.id}
                      id={i.id}
                      email={i.email}
                      role={i.role}
                      onResend={onResend}
                      onCancel={onCancel}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          <Card className="h-fit p-5">
            <h2 className="mb-3 text-md font-semibold">Invite a member</h2>
            <InviteMemberForm action={onInvite} />
          </Card>
        </div>
      ),
    },
    {
      id: "opportunities",
      label: "Opportunities & SOWs",
      content:
        opportunities.length === 0 ? (
          <EmptyState>
            No opportunities yet. They surface here as Atlas extracts and scores
            captures from completed sessions. Run “Recompute” on a sprint to
            generate them from the captures so far.
          </EmptyState>
        ) : (
          <div className="space-y-2">
            {opportunities.map((o) => (
              <OpportunityCurationCard
                key={o.id}
                opp={{
                  id: o.id,
                  title: o.title,
                  description: o.description,
                  rationale: o.rationale,
                  impactLow: o.impactLow,
                  impactHigh: o.impactHigh,
                  compositeScore: o.compositeScore,
                  status: o.status,
                  sprintName: sprintName(o.sprintId),
                  sowStatus: o.sowStatus,
                }}
                detailHref={`/admin/clients/${tenantId}/sprint/${o.sprintId}/opportunity/${o.id}`}
                sowHref={
                  o.sowStatus
                    ? `/admin/clients/${tenantId}/sprint/${o.sprintId}/opportunity/${o.id}/sow`
                    : null
                }
                onUpdate={onUpdateOpp}
                onSetStatus={onSetOppStatus}
              />
            ))}
            <p className="px-1 pt-1 text-xs text-text-3">
              Twistag curation. Editing and provisional/surfaced/hidden are
              staff-only; approving an opportunity stays with the client&apos;s
              sponsor and manager, and approved rows are frozen here.
            </p>
          </div>
        ),
    },
    {
      id: "activity",
      label: "Activity",
      content: (
        <Card className="p-5">
          {activity.rows.length === 0 ? (
            <p className="text-sm text-text-3">
              No admin activity yet. Twistag changes to this client land here
              automatically.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {activity.rows.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-medium">{r.action}</span>
                    {r.targetId ? (
                      <span className="text-text-3"> · {r.targetId}</span>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-xs text-text-3">
                    {fmtAt(r.at)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <Link
            href={`/admin/audit?tenantId=${tenantId}`}
            className="mt-4 inline-block text-[13px] font-medium text-brand hover:underline"
          >
            View full audit log →
          </Link>
        </Card>
      ),
    },
  ];

  return (
    <PageContainer>
      <div className="mb-6">
        <BackLink href="/admin">All clients</BackLink>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            <CompanyLogo domain={tenant.domain} name={tenant.name} size="md" />
            <h1 className="text-3xl font-semibold tracking-tight">
              {tenant.name}
            </h1>
          </div>
          <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
        </div>
        <p className="mt-1.5 text-md text-text-2">{tenant.segment}</p>
      </div>
      <ClientTabs tabs={tabs} />
    </PageContainer>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <Card className="border-dashed bg-transparent">
      <div className="px-6 py-10 text-center text-sm text-text-2">
        {children}
      </div>
    </Card>
  );
}
