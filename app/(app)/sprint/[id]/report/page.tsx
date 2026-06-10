import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/ui/BackLink";
import { PrintButton } from "@/components/report/PrintButton";
import { ReportArticle } from "@/components/report/ReportArticle";
import { getApi } from "@/server/trpc/caller";
import { requireManagerOrSponsor } from "@/lib/auth-guards";

export const metadata: Metadata = { title: "Discovery report · Atlas" };
export const dynamic = "force-dynamic";

export default async function FinalReport({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireManagerOrSponsor();
  const isSponsor = session.role === "sponsor";
  const api = await getApi();
  const sprint = await api.sprint.get({ id }).catch(() => null);
  if (!sprint) notFound();
  const [p, opps] = await Promise.all([
    api.sprint.progress({ id }),
    api.opportunity.listForSprint({ sprintId: id }),
  ]);

  return (
    <div className="bg-bg">
      {/* Toolbar */}
      <div
        data-print-hide
        className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur"
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-2.5">
          <BackLink href={`/sprint/${id}`}>
            {isSponsor ? "Go to dashboard" : "Back to sprint"}
          </BackLink>
          <div className="flex items-center gap-3">
            {isSponsor ? (
              <span className="text-xs font-medium text-text-3">
                Sponsor view
              </span>
            ) : null}
            <PrintButton />
          </div>
        </div>
      </div>

      <ReportArticle
        sprint={sprint}
        progress={p}
        opps={opps}
        opportunityHref={(oid) => `/sprint/${id}/opportunity/${oid}`}
      />
    </div>
  );
}
