import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SowView } from "@/components/sow/SowView";
import { getApi } from "@/server/trpc/caller";
import { requireTwistagSession } from "@/lib/auth-guards";

export const metadata: Metadata = { title: "SOW · Atlas admin" };
export const dynamic = "force-dynamic";

export default async function TwistagSow({
  params,
}: {
  params: Promise<{ tenantId: string; sprintId: string; oppId: string }>;
}) {
  await requireTwistagSession();
  const { tenantId, sprintId, oppId } = await params;
  const api = await getApi();
  const data = await api.twistag
    .sowView({ opportunityId: oppId })
    .catch(() => null);
  // Guard: the opportunity must belong to the tenant + sprint in the URL, and a
  // SOW draft must exist.
  if (
    !data ||
    data.tenantId !== tenantId ||
    data.sprintId !== sprintId ||
    !data.sow
  ) {
    notFound();
  }

  return (
    <SowView
      sow={data.sow}
      opportunityTitle={data.opportunityTitle}
      currency={data.currency}
      backHref={`/admin/clients/${tenantId}/sprint/${sprintId}/opportunity/${oppId}`}
    />
  );
}
