import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/ui/BackLink";
import { PrintButton } from "@/components/report/PrintButton";
import { ReportArticle } from "@/components/report/ReportArticle";
import { getApi } from "@/server/trpc/caller";
import { requireTwistagSession } from "@/lib/auth-guards";

export const metadata: Metadata = { title: "Discovery report · Atlas admin" };
export const dynamic = "force-dynamic";

export default async function TwistagReport({
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

  return (
    <div className="bg-bg">
      {/* Toolbar */}
      <div
        data-print-hide
        className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur"
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-2.5">
          <BackLink href={`/admin/clients/${tenantId}`}>
            Back to client
          </BackLink>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-text-3">
              Twistag view · read-only
            </span>
            <PrintButton />
          </div>
        </div>
      </div>

      <ReportArticle
        sprint={data.sprint}
        progress={data.progress}
        opps={data.opportunities}
      />
    </div>
  );
}
