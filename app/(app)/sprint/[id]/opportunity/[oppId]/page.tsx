import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OpportunityDetail } from "@/components/opportunity/OpportunityDetail";
import { buildSowDraft } from "@/lib/sow";
import { getApi } from "@/server/trpc/caller";
import { requireManagerOrSponsor } from "@/lib/auth-guards";
import { approveOpportunity } from "./actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; oppId: string }>;
}): Promise<Metadata> {
  const { oppId } = await params;
  try {
    const api = await getApi();
    const opp = await api.opportunity.get({ id: oppId });
    return { title: `${opp.title} · Atlas` };
  } catch {
    return { title: "Opportunity · Atlas" };
  }
}

export default async function OpportunityPage({
  params,
}: {
  params: Promise<{ id: string; oppId: string }>;
}) {
  const { id, oppId } = await params;
  const session = await requireManagerOrSponsor();
  const api = await getApi();
  const [opp, sprint] = await Promise.all([
    api.opportunity.get({ id: oppId }).catch(() => null),
    api.sprint.get({ id }).catch(() => null),
  ]);
  if (!opp) notFound();

  return (
    <OpportunityDetail
      sprintId={id}
      opp={opp}
      sow={buildSowDraft(opp, sprint?.tenantName ?? "your organization")}
      approverRole={session.role}
      onApprove={approveOpportunity}
    />
  );
}
