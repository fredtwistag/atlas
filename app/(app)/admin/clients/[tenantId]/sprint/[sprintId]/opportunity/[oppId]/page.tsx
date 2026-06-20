import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OpportunityDetail } from "@/components/opportunity/OpportunityDetail";
import { getApi } from "@/server/trpc/caller";
import { requireTwistagSession } from "@/lib/auth-guards";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenantId: string; sprintId: string; oppId: string }>;
}): Promise<Metadata> {
  const { oppId } = await params;
  try {
    const api = await getApi();
    const data = await api.twistag.opportunityView({ opportunityId: oppId });
    return { title: `${data.opp.title} · Atlas admin` };
  } catch {
    return { title: "Opportunity · Atlas admin" };
  }
}

export const dynamic = "force-dynamic";

export default async function TwistagOpportunity({
  params,
}: {
  params: Promise<{ tenantId: string; sprintId: string; oppId: string }>;
}) {
  await requireTwistagSession();
  const { tenantId, sprintId, oppId } = await params;
  const api = await getApi();
  const data = await api.twistag
    .opportunityView({ opportunityId: oppId })
    .catch(() => null);
  // Guard: the opportunity must belong to the tenant + sprint in the URL.
  if (!data || data.tenantId !== tenantId || data.sprintId !== sprintId) {
    notFound();
  }

  return (
    <OpportunityDetail
      sprintId={sprintId}
      opp={data.opp}
      readOnly
      backHref={`/admin/clients/${tenantId}/sprint/${sprintId}/report`}
      backLabel="Back to report"
    />
  );
}
